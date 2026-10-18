import type { DataScope } from './common';

/**
 * The authenticated principal, assembled server-side on every request.
 *
 * Nothing in here is ever read from a request body or header supplied by the
 * client. `organizationId` in particular is derived from the access token and
 * re-verified against the membership table.
 */

export type PrincipalKind = 'platform' | 'staff' | 'customer' | 'service';

export interface RequestPrincipal {
  kind: PrincipalKind;
  userId: string;
  sessionId: string;
  email: string;
  /** Null only for platform principals operating outside a tenant. */
  organizationId: string | null;
  /** Employee record linked to this user, when one exists. */
  employeeId: string | null;
  /** Customer record for portal principals. */
  customerId: string | null;
  /** Branches the principal may act within. Empty means unrestricted. */
  branchIds: string[];
  /** Branch the client selected for this request, validated against branchIds. */
  activeBranchId: string | null;
  roleKeys: string[];
  permissions: string[];
  dataScope: DataScope;
  enabledModules: string[];
  locale: string;
  timeZone: string;
  mfaVerified: boolean;
  /** Present when a platform admin is acting under an approved support grant. */
  supportGrantId?: string | null;
  impersonatedBy?: string | null;
}

export interface RequestContext {
  requestId: string;
  correlationId: string;
  ip: string;
  userAgent: string;
  deviceId: string | null;
  principal: RequestPrincipal | null;
  startedAt: number;
}

export type { DataScope };
