import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC = 'operix:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
/**
 * Security/session actions that must stay reachable for an authenticated user
 * who still has to enroll MFA, or whose workspace is read-only (sign-out,
 * own profile, MFA enrollment).
 */
export const ACCOUNT_SECURITY = 'operix:accountSecurity';
export const AccountSecurity = () => SetMetadata(ACCOUNT_SECURITY, true);
