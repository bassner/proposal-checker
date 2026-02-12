export { auth as middleware } from "@/auth";

// Protect all page routes (redirect to Keycloak login for unauthenticated users).
// API routes are excluded — they use requireAuth()/requireRole() and return JSON 401/403.
// Static assets and favicon are also excluded.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sign-in).*)"],
};
