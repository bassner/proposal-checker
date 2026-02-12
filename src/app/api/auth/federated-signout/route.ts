import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * GET /api/auth/federated-signout
 *
 * Performs federated logout: clears the local next-auth session cookie,
 * then redirects to Keycloak's end-session endpoint so the SSO session
 * is also destroyed. This prevents auto-re-login on shared computers.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const idToken = session?.idToken;

  const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
  const clientId = process.env.AUTH_KEYCLOAK_ID;
  const origin = process.env.AUTH_URL || new URL(request.url).origin;

  let redirectUrl: string;

  if (issuer) {
    const logoutUrl = new URL(`${issuer}/protocol/openid-connect/logout`);
    if (idToken) {
      logoutUrl.searchParams.set("id_token_hint", idToken);
    }
    if (clientId) {
      logoutUrl.searchParams.set("client_id", clientId);
    }
    logoutUrl.searchParams.set("post_logout_redirect_uri", `${origin}/signed-out`);
    redirectUrl = logoutUrl.toString();
    console.log("[signout] idToken present:", !!idToken, "| redirect:", redirectUrl);
  } else {
    // No Keycloak issuer configured — just redirect home
    redirectUrl = origin;
  }

  const response = NextResponse.redirect(redirectUrl);

  // Clear all authjs cookies, including chunked session tokens (.0, .1, etc.)
  // Auth.js chunks large JWT cookies — we must clear every chunk to fully log out.
  const allCookies = request.cookies.getAll();
  for (const cookie of allCookies) {
    if (cookie.name.includes("authjs.")) {
      response.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
    }
  }

  return response;
}
