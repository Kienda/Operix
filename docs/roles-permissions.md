# Roles and permissions

The canonical permission catalog and system roles are in `backend/packages/permissions/src`. Roles store explicit permission keys; controllers declare required permissions and the API guard enforces them. Default business roles include Owner, Company Administrator, Finance Manager, Project Manager, Inventory Manager, HR Manager, Employee, Auditor, and Read-only User. Platform Super Admin is deliberately excluded from ordinary tenant role seeding.
