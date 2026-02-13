import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import Credentials from "next-auth/providers/credentials";
import { APP_ROLES, getKeycloakRoleMapping } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";
import "@/types/auth";

// ---------------------------------------------------------------------------
// Dev mode test users (only available when AUTH_DEV_MODE=true)
// ---------------------------------------------------------------------------

const DEV_USERS: Record<string, { id: string; name: string; email: string; role: AppRole }> = {
  admin: { id: "dev-admin-00000000-0000-0000-0000-000000000001", name: "Dev Admin", email: "admin@test.local", role: "admin" },
  phd: { id: "dev-phd-00000000-0000-0000-0000-000000000002", name: "Dr. Supervisor", email: "phd@test.local", role: "phd" },
  student1: { id: "dev-student-00000000-0000-0000-0000-000000000003", name: "Alice Student", email: "alice@test.local", role: "student" },
  student2: { id: "dev-student-00000000-0000-0000-0000-000000000004", name: "Bob Student", email: "bob@test.local", role: "student" },
  phd2: { id: "dev-phd-00000000-0000-0000-0000-000000000005", name: "Prof. Reviewer", email: "phd2@test.local", role: "phd" },
};

// ---------------------------------------------------------------------------
// Keycloak helpers
// ---------------------------------------------------------------------------

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
 */
function extractRole(accessToken: string): AppRole | undefined {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return undefined;

  const clientId = process.env.AUTH_KEYCLOAK_ID;
  const roleMapping = getKeycloakRoleMapping();

  const clientRoles = clientId
    ? (payload.resource_access as Record<string, { roles?: string[] }>)?.[clientId]?.roles ?? []
    : [];
  const realmRoles = (payload.realm_access as { roles?: string[] })?.roles ?? [];
  const groups = Array.isArray(payload.groups) ? (payload.groups as string[]) : [];
  const allRoles = [...clientRoles, ...realmRoles, ...groups];

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
    signal: AbortSignal.timeout(10_000),
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
    role: newRole,
    error: newRole ? undefined : "NoRole",
  };
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const isDevMode = process.env.AUTH_DEV_MODE === "true" || process.env.NEXT_PUBLIC_AUTH_DEV_MODE === "true";

const providers = isDevMode
  ? [
      Credentials({
        id: "dev-login",
        name: "Dev Login",
        credentials: {
          userId: { label: "User", type: "text" },
        },
        authorize(credentials) {
          const userId = credentials?.userId as string | undefined;
          if (!userId || !(userId in DEV_USERS)) return null;
          const u = DEV_USERS[userId];
          return { id: u.id, name: u.name, email: u.email, role: u.role };
        },
      }),
    ]
  : [Keycloak];

// ---------------------------------------------------------------------------
// NextAuth config
// ---------------------------------------------------------------------------

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    jwt({ token, account, user }) {
      // Dev mode: credentials provider — store role directly
      if (isDevMode && user) {
        token.sub = (user as { id: string }).id;
        token.role = (user as { role?: AppRole }).role;
        token.expiresAt = Math.floor(Date.now() / 1000) + 8 * 60 * 60;
        return token;
      }

      // Keycloak: initial sign-in
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

      // Dev mode doesn't need refresh
      if (isDevMode) return token;

      // Access token expired — refresh it
      return refreshAccessToken(token).catch((err) => {
        console.error("[auth] Token refresh failed:", err);
        return { ...token, role: undefined, accessToken: undefined, error: "RefreshTokenError" as const };
      });
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (token.role) session.user.role = token.role as AppRole;
      if (token.idToken) session.idToken = token.idToken as string;
      if (token.error) session.error = token.error as string;
      return session;
    },
    authorized({ auth }) {
      return !!auth?.user?.role && !auth?.error;
    },
  },
});

/** Dev users — exported for use in dev-mode login UI. */
export { DEV_USERS, isDevMode };
