# Database

PostgreSQL migrations are in `backend/packages/database/prisma/migrations`. Core normalized tables cover organizations, memberships, roles, sessions, subscriptions, immutable subscription history, audit logs, invoices/payments/allocations, and immutable inventory movements. Flexible `BusinessRecord` rows cover evolving operational modules while retaining tenant, branch, creator, status, timestamps, and archival metadata.

Deploy migrations with `pnpm db:deploy`; never use `prisma db push` in production.
