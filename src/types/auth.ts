import type { AppRole } from "@/lib/auth/roles";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role?: AppRole;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: AppRole;
    };
    /** Keycloak ID token — used for federated signout. */
    idToken?: string;
    /** Set when token refresh fails — client should re-login. */
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppRole;
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    expiresAt?: number;
    error?: string;
  }
}
