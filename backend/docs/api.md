# API conventions

All payloads use JSON and all dates use ISO 8601. Lists accept `page`, `limit`, `status`, and `search`. Errors use `{ success: false, error: { code, message }, requestId, timestamp }`. Send `Authorization` and `x-organization-id` on protected endpoints. OpenAPI documentation is generated from the running service at `/docs`.

Business records share `module`, `type`, `name`, optional `number`, optional authorized `branchId`, `status`, and a domain-specific `data` object. Financial and inventory commands have dedicated endpoints because their totals and balances must be calculated transactionally by the server. Contract gating (`POST /projects/:id/start`) and attendance (`POST /attendance/check-in|:id/check-out|:id/approve`) are dedicated endpoints for the same reason: the server, not the client, decides whether a contract counts as fully executed or a GPS fix falls inside a geofence.

Login accepts an optional `mfaCode` (6 digits); when a user has MFA enabled the server responds `401 MFA code required` until one is supplied. Password reset and invitation-accept tokens are single-use, expire, and are looked up by a SHA-256 hash rather than compared in plaintext.
