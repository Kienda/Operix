# Testing

Run `pnpm test`, `pnpm typecheck`, and `pnpm build` from `backend`; run `npm run build` at the root. Critical API suites cover RBAC, resource tenant scoping, project gates, attendance/geofencing, and subscription pricing. Before release, verify cross-tenant record/document/search/update attempts, tenant-to-platform denial, viewer mutation denial, employee finance denial, payment allocation/reversal, stock movement immutability, expiration read-only mode, and backup restoration.

The permissions package contains a release role matrix covering Owner, Administrator, Sales Manager, Sales Representative, Project Manager, HR Manager, Inventory Manager, Production Manager, Finance Manager, Security Guard, Employee, and Read-only User. The development seed provisions a login for each role so API and navigation checks can be repeated against the running application.
