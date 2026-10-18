# Architecture

Operix uses React/Vite for the responsive web client and a versioned NestJS REST API. PostgreSQL is accessed through Prisma. Redis supports asynchronous jobs, and private S3-compatible object storage is the document target. Every tenant-owned query is resolved from authenticated membership and scoped by `organizationId`; role permissions are enforced in the global API guard.

Production topology: Route 53/DNS → HTTPS Nginx on Ubuntu LTS EC2 → containerized API/client/worker → private RDS PostgreSQL, ElastiCache Redis, and private S3. Secrets belong in AWS Secrets Manager or Parameter Store.
