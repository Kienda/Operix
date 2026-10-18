# AWS deployment

Use the [restricted staging deployment runbook](../deploy/README.md) and
[verification/release gates](../deploy/verification.md). The implementation targets the existing shared
Ubuntu EC2 in us-east-1, under `/opt/ght/apps/operix`, with isolated Docker Compose services.
RDS/ElastiCache are not prerequisites for this selected staging architecture.

GitHub Actions checks the locked frontend/backend, builds and tests Linux images, publishes unique ECR tags
only after gates, and uses OIDC plus a restricted SSM document. AWS publication/deployment switches remain
disabled until explicitly configured after approval. No AWS/DNS/proxy/Tontin change has been performed.

The September 30 audit and October 2 update remain the implementation baseline. Successful image builds
do not authorize staff access: dependency advisories, broad QA/browser failures, operational restore and
restricted-staging acceptance must be resolved. The worker is deliberately disabled because delivery and
export/render jobs are unfinished. No demo seed or default-account creation runs during deployment.
