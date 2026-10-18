# Security

Passwords use Argon2id. Access tokens are short lived and refresh tokens rotate; reset and invitation tokens are single-use hashes. Backend membership resolution, permission checks, branch scope, tenant filters, audit events, Helmet, restricted CORS, and validation provide defense in depth. Expired, suspended, and cancelled subscriptions are enforced read-only by the API guard. Platform permissions are separate from tenant roles.

Production requires unique JWT/encryption secrets, HTTPS, private database/storage, MFA for privileged roles, malware scanning for uploads, dependency review, backups, and removal of all development seed credentials.
