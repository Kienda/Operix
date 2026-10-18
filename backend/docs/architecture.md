# Architecture

```text
Web / Mobile / Customer Portal
            |
      Cloudflare WAF
            |
       NestJS REST API ---- Redis / BullMQ Worker
            |
      Prisma transactions
            |
 PostgreSQL (+ PostGIS in production) ---- Private object storage
```

The API is stateless. JWT access tokens are short lived, refresh tokens rotate and are stored only as Argon2id hashes. Organization membership is resolved on every request. Shared `BusinessRecord` storage provides a consistent lifecycle for broad modules, while financially or operationally sensitive workflows use strongly modeled tables and database transactions.

## Tenant isolation

1. Never accept an organization identifier from request bodies.
2. Resolve it from the organization header only after validating current user membership.
3. Include it in every read, update and archive predicate.
4. Validate referenced records belong to the same tenant within a transaction.
5. Add PostgreSQL row-level security policies in managed production environments as defense in depth.
6. Exercise cross-tenant attempts in automated integration tests.
