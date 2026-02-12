export type AppRole = "admin" | "phd" | "student";

const ROLE_CONFIG: { name: AppRole; level: number }[] = [
  { name: "admin", level: 3 },
  { name: "phd", level: 2 },
  { name: "student", level: 1 },
];

/** All recognized app roles, in priority order (highest first). */
export const APP_ROLES: AppRole[] = ROLE_CONFIG.map((r) => r.name);

/** Numeric hierarchy for access control comparisons. */
export const ROLE_HIERARCHY: Record<AppRole, number> = Object.fromEntries(
  ROLE_CONFIG.map((r) => [r.name, r.level])
) as Record<AppRole, number>;

/**
 * Build a mapping from Keycloak role names to app roles.
 * Configurable via env vars: AUTH_ROLE_ADMIN, AUTH_ROLE_PHD, AUTH_ROLE_STUDENT.
 * Defaults to the app role name itself if not set.
 */
export function getKeycloakRoleMapping(): Record<string, AppRole> {
  const mapping: Record<string, AppRole> = {};
  // Iterate lowest-priority first so higher-priority roles win on collision
  for (const role of [...APP_ROLES].reverse()) {
    const envKey = `AUTH_ROLE_${role.toUpperCase()}`;
    const keycloakName = process.env[envKey] || role;
    if (mapping[keycloakName] && mapping[keycloakName] !== role) {
      console.warn(
        `[auth] Role mapping collision: Keycloak role "${keycloakName}" maps to both "${mapping[keycloakName]}" and "${role}". Using higher-priority role "${role}".`
      );
    }
    mapping[keycloakName] = role;
  }
  return mapping;
}
