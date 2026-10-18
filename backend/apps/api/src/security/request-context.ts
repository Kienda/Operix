import type { Request } from 'express';
import type { DataScope, ModuleKey } from '@operix/permissions';
export interface AuthContext {
  userId: string;
  organizationId: string;
  sessionId: string;
  /** Effective exact capabilities, resolved from database state per request. */
  permissions: string[];
  branchIds: string[];
  dataScope: DataScope;
  enabledModules: ModuleKey[];
  customerId: string | null;
  employeeId: string | null;
  /** Stable key of the assigned role (system or pilot catalog), if any. */
  roleKey: string | null;
  isOwner: boolean;
  /** True when organization policy requires MFA for this role and it is not yet enabled. */
  mfaEnrollmentRequired: boolean;
}
export type AuthenticatedRequest = Request & { auth: AuthContext };
