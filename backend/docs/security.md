# Security and release checklist

- Replace JWT, encryption and provider secrets; use a managed secrets vault.
- Enforce TLS, a strict CORS allowlist, secure cookies where used, and WAF rate limits.
- TOTP MFA is implemented (`/auth/mfa/enroll|confirm|disable`, enforced at login). Require it organizationally for owners, finance, payroll and platform administrators — the platform does not yet force enrollment by role.
- Keep PostgreSQL and Redis private; require TLS and automated backups.
- Configure object storage as private with short-lived presigned URLs and malware scanning.
- Apply least-privilege database credentials and production RLS policies.
- Never log tokens, passwords, payroll values, payment proofs or personal documents. **Known gap:** `forgot-password` and invitation creation currently `console.log` the raw reset/invite URL (including the token) in place of real email delivery — remove this before production and route through the `MAIL_DRIVER` provider instead.
- Run dependency, container, secret and SAST scans in CI.
- Test restore procedures, tenant isolation, permission changes and session revocation.
- Retain immutable audit events according to each organization’s compliance policy.
