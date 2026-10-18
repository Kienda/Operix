import { isKnownPermission, moduleOfPermission } from './permissions';
import type { ModuleKey } from './modules';

/**
 * Effective-permission resolution.
 *
 * The order of precedence, highest first:
 *   1. An explicit DENY override on the user (always wins, even for the owner).
 *   2. Module enablement — a permission whose module is off is never granted.
 *   3. An explicit ALLOW override on the user.
 *   4. The union of the user's role permissions.
 *
 * Nothing here trusts the client. The caller assembles `AbilityInput` from
 * database state only.
 */

export type PermissionOverrideEffect = 'allow' | 'deny';

export interface PermissionOverride {
  permission: string;
  effect: PermissionOverrideEffect;
  /** Optional expiry for temporary elevation, e.g. approved support access. */
  expiresAt?: Date | null;
}

export type DataScope = 'all' | 'branch' | 'assigned' | 'self' | 'customer';

export interface AbilityInput {
  /** Union of permission keys granted by every role the user holds. */
  rolePermissions: string[];
  /** User-specific overrides, allow or deny. */
  overrides?: PermissionOverride[];
  /** Modules currently enabled for the organization (subscription ∩ owner choice). */
  enabledModules: ModuleKey[];
  /** Narrowest data scope across the user's roles. */
  dataScope: DataScope;
  /** Explicit branch ceiling, including for an otherwise organization-wide role. */
  branchIds?: string[];
  /** Set when the principal is a customer portal user. */
  customerId?: string | null;
  /** Set when the principal is a staff member linked to an employee record. */
  employeeId?: string | null;
}

export interface Ability {
  readonly granted: ReadonlySet<string>;
  readonly dataScope: DataScope;
  readonly branchIds: readonly string[];
  readonly customerId: string | null;
  readonly employeeId: string | null;
  can(permission: string): boolean;
  canAll(permissions: string[]): boolean;
  canAny(permissions: string[]): boolean;
  /** True when the user may read/write records belonging to `branchId`. */
  canAccessBranch(branchId: string | null | undefined): boolean;
  toJSON(): string[];
}

const SCOPE_RANK: Record<DataScope, number> = {
  all: 4,
  branch: 3,
  assigned: 2,
  self: 1,
  customer: 0,
};

/** Returns the most restrictive of the provided scopes. */
export function narrowestScope(scopes: DataScope[]): DataScope {
  if (scopes.length === 0) return 'self';
  return scopes.reduce((acc, s) => (SCOPE_RANK[s] < SCOPE_RANK[acc] ? s : acc));
}

/** Returns the broadest of the provided scopes (a user's union of roles). */
export function broadestScope(scopes: DataScope[]): DataScope {
  if (scopes.length === 0) return 'self';
  return scopes.reduce((acc, s) => (SCOPE_RANK[s] > SCOPE_RANK[acc] ? s : acc));
}

function isActive(override: PermissionOverride, now: Date): boolean {
  return !override.expiresAt || override.expiresAt.getTime() > now.getTime();
}

export function buildAbility(input: AbilityInput, now: Date = new Date()): Ability {
  const enabled = new Set<ModuleKey>(input.enabledModules);
  const overrides = (input.overrides ?? []).filter((o) => isActive(o, now));

  const denied = new Set(overrides.filter((o) => o.effect === 'deny').map((o) => o.permission));
  const allowed = new Set(overrides.filter((o) => o.effect === 'allow').map((o) => o.permission));

  const granted = new Set<string>();

  const consider = (permission: string): void => {
    if (!isKnownPermission(permission)) return;
    if (denied.has(permission)) return;
    const module = moduleOfPermission(permission);
    if (module && !enabled.has(module)) return;
    granted.add(permission);
  };

  for (const permission of input.rolePermissions) consider(permission);
  for (const permission of allowed) consider(permission);

  const branchIds = input.branchIds ?? [];
  const customerId = input.customerId ?? null;
  const employeeId = input.employeeId ?? null;
  const dataScope = input.dataScope;

  const can = (permission: string): boolean => granted.has(permission);

  return {
    granted,
    dataScope,
    branchIds,
    customerId,
    employeeId,
    can,
    canAll: (permissions) => permissions.every(can),
    canAny: (permissions) => permissions.some(can),
    canAccessBranch: (branchId) => {
      if (branchIds.length) return !!branchId && branchIds.includes(branchId);
      // A branch role without assigned branches fails closed. Self/assigned
      // scopes still require record ownership in the persistence policy.
      return dataScope !== 'branch';
    },
    toJSON: () => [...granted].sort(),
  };
}

/**
 * Matches a permission against a pattern that may end in `.*`.
 * Used only for UI grouping and role editors — never for enforcement, which
 * always compares exact keys.
 */
export function matchesPattern(permission: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return permission.startsWith(pattern.slice(0, -1));
  return permission === pattern;
}
