# AWS deployment

1. Provision a private RDS PostgreSQL instance, private S3 bucket, ElastiCache Redis, and Ubuntu LTS EC2 in a VPC. Permit database/Redis traffic only from the application security group.
2. Store production environment values in Secrets Manager/Parameter Store. Set strong JWT/encryption secrets, `NODE_ENV=production`, restricted CORS, S3 credentials/role, and SES SMTP credentials.
3. Build immutable API, worker, and client artifacts in CI after lint, typecheck, tests, and builds pass.
4. Deploy with Docker Compose or systemd, run `pnpm db:deploy` as a controlled release step, then start the API/worker.
5. Put Nginx in front, configure the production DNS record and Certbot/ACM-managed TLS, and verify `/api/v1/health`.
6. Enable RDS automated backups/PITR, S3 versioning/lifecycle, CloudWatch logs/alarms, restricted key-only SSH, firewalling, and unattended security updates.

For rollback, retain the previous image, stop traffic, restore the previous application image, and only restore RDS from a snapshot/PITR when the migration is not backward compatible. Test restoration quarterly.
