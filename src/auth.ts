import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { APP_ROLES, getKeycloakRoleMapping } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";
import "@/types/auth";

/**
 * Decode the payload of a JWT without verifying the signature.
 * Safe here because the access token was obtained server-side from Keycloak's
 * token endpoint over TLS during the OIDC code exchange — we trust the origin.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Extract the highest-priority app role from a Keycloak access token.
 * Collects roles from both `resource_access[clientId].roles` (client-scoped)
 * and `realm_access.roles`, then returns the highest-priority app role found
 * across both sources (admin > phd > student).
 * Role names are configurable via AUTH_ROLE_ADMIN / AUTH_ROLE_PHD / AUTH_ROLE_STUDENT env vars.
 * Returns undefined if no recognized role is found (fail-closed).
 */
function extractRole(accessToken: string): AppRole | undefined {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return undefined;

  const clientId = process.env.AUTH_KEYCLOAK_ID;
  const roleMapping = getKeycloakRoleMapping();

  // Collect roles from client-scoped roles, realm roles, and groups
  const clientRoles = clientId
    ? (payload.resource_access as Record<string, { roles?: string[] }>)?.[clientId]?.roles ?? []
    : [];
  const realmRoles = (payload.realm_access as { roles?: string[] })?.roles ?? [];
  const groups = Array.isArray(payload.groups) ? (payload.groups as string[]) : [];
  const allRoles = [...clientRoles, ...realmRoles, ...groups];

  // Return the highest-priority recognized role
  for (const appRole of APP_ROLES) {
    const keycloakNames = Object.entries(roleMapping)
      .filter(([, ar]) => ar === appRole)
      .map(([kn]) => kn);
    if (keycloakNames.some((kn) => allRoles.includes(kn))) return appRole;
  }
  return undefined;
}

/**
 * Refresh the Keycloak access token using the stored refresh token.
 * Re-extracts the role from the fresh access token so role changes
 * propagate within ~5 minutes (Keycloak's default access token lifetime).
 */
async function refreshAccessToken(token: Record<string, unknown>): Promise<Record<string, unknown>> {
  const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
  const clientId = process.env.AUTH_KEYCLOAK_ID;
  const clientSecret = process.env.AUTH_KEYCLOAK_SECRET;

  if (!issuer || !clientId || !clientSecret || !token.refreshToken) {
    throw new Error("Missing refresh configuration");
  }

  const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refreshToken as string,
    }),
    signal: AbortSignal.timeout(10_000), // Prevent hanging if Keycloak is unreachable
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Refresh response missing access_token");
  }
  const newRole = extractRole(data.access_token);

  return {
    ...token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? token.refreshToken,
    idToken: data.id_token ?? token.idToken,
    expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 300),
    // Re-extract role from the fresh token — propagates Keycloak role changes
    role: newRole,
    // Clear any previous refresh error
    error: newRole ? undefined : "NoRole",
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Keycloak],
  pages: {
    signIn: "/sign-in",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours — access token refreshes keep role current
  },
  callbacks: {
    jwt({ token, account }) {
      // Initial sign-in: extract everything from the OIDC response
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.idToken = account.id_token;
        token.expiresAt = account.expires_at;
        if (account.access_token) {
          token.role = extractRole(account.access_token);
        }
        return token;
      }

      // Access token still valid — return as-is
      const expiresAt = token.expiresAt as number | undefined;
      if (expiresAt && Date.now() < expiresAt * 1000) {
        return token;
      }

      // Access token expired — refresh it
      return refreshAccessToken(token).catch((err) => {
        console.error("[auth] Token refresh failed:", err);
        // Clear role and tokens so the user is denied by authorized() and requireAuth()
        return { ...token, role: undefined, accessToken: undefined, error: "RefreshTokenError" as const };
      });
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (token.role) session.user.role = token.role as AppRole;
      if (token.idToken) session.idToken = token.idToken as string;
      // Signal client that refresh failed — should re-login
      if (token.error) session.error = token.error as string;
      return session;
    },
    authorized({ auth }) {
      // User must be authenticated AND have a recognized role AND no auth error.
      // Fail-closed: users without a mapped role or with a failed token refresh
      // are denied even if they authenticated successfully via Keycloak.
      return !!auth?.user?.role && !auth?.error;
    },
  },
});
