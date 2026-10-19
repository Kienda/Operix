# Restricted staging deployment report — Operix on AWS

Date: 2026-10-18 (America/New_York) · Account 471112967488 · us-east-1 · Instance `i-0ea991afd785b72e0` (t3.large, shared with Tontin)

## Release readiness

**NOT DEPLOYED — NOT READY FOR STAFF.** Code-level gates pass and AWS foundations exist; the remaining
steps each need your approval or a credential only you can supply (list below). No verified Operix URL
exists yet: today both hostnames are proxied by Cloudflare into Tontin's proxy, which redirects them to
`https://app.tontin.net/`.

## Done and verified

| Area | State | Evidence |
| --- | --- | --- |
| GitHub OIDC provider | Exists; audience `sts.amazonaws.com` | `iam get-open-id-connect-provider` |
| OIDC trust | `ImagesRole` / `DeployRole` trust exactly `repo:Kienda/Operix:environment:operix-images` / `…:operix-staging` (StringEquals) | deployed role policies |
| CloudFormation `operix-staging` | `CREATE_COMPLETE` (executed by `keinda` 2026-10-19 00:11 UTC): 4 ECR repos (immutable tags, scan on push), versioned encrypted private artifact/backup buckets (TLS-only, retained), 2 OIDC roles, SSM document `Operix-Staging-Release` v1, Operix-only policy on `GHT-EC2-SSM-Role` | stack outputs |
| KMS `alias/operix-staging` | Customer key; only the EC2 role may decrypt, and only via Secrets Manager | key policy |
| Backend gates on the committed lockfile | 0 advisories; typecheck, build, format; unit 44 + 67; P0 27/27; pilot 31/31; QA 126 + 22 documented gaps | local run |
| Images | api, worker, migrate, web, tunnel: **0 HIGH / 0 CRITICAL** (Trivy 0.61.1); production Compose smoke test passes | local run |
| Deployment contracts | 7/7, ShellCheck, actionlint | local run |

## Changes made in this pass (repository only)

| Change | Why |
| --- | --- |
| `TRUST_PROXY` 2 → **1** + contract test | **High.** With the gateway passing `X-Forwarded-For` through, `2` made `req.ip` the client-supplied entry (demonstrated: `6.6.6.6` accepted), defeating per-IP rate limits on sign-in/reset/MFA and falsifying audit IPs |
| `PROXY_MODE=tunnel`: `compose.tunnel.yml`, `docker/tunnel.Dockerfile`, optional `CLOUDFLARE_TUNNEL_TOKEN` | Ports 80/443 belong to Tontin's proxy container; host/docker-edge modes would modify Tontin. The connector is outbound-only, joins only the gateway network, publishes no port |
| Tunnel image rebuilt from the digest-pinned upstream binary on distroless `static` | Upstream image had 1 HIGH (unused OpenSSL); no gate exception |
| Fixed bridge names `opx-ingress`/`opx-egress` + DOCKER-USER drop to `169.254.169.254` (deploy.sh and `operix-imds-block.service`) | IMDS hop limit 2 lets containers obtain the shared instance role, which can now read the Operix secret |
| `operix-tunnel` ECR repository in the template, CI build/scan/publish | Fifth image follows the same gates |
| `scripts/create-runtime-secret.py` | Generates DB/Redis/JWT credentials locally, prompts (no echo) only for SMTP and tunnel token, validates with the host's own code, passes the payload via a private temp file, prints no values |
| `scripts/render-host-bootstrap.py` | Renders the host bootstrap from stack outputs with SHA-256-checked embedded files, LF-normalised |

## Actions requiring your approval or input (in order)

| # | Action | Type | Effect |
| --- | --- | --- | --- |
| 1 | Execute change set `add-tunnel-repo-202610182050` | AWS change | Adds `operix-tunnel` repo; adds it to `ImagesRole` and the instance policy (in place, no replacement) |
| 2 | Push branch `fix/workflow-10-ci`, open PR, merge to `main` after CI is green | Public repo | Runs verify/security/images; publish stays off until step 5 |
| 3 | Cloudflare (dashboard, ~10 min): create tunnel `operix-staging`; **delete the two proxied A records** for `operix` and `operix-api`; add both as tunnel public hostnames → `http://web:8080`; create an Access application for both hostnames allowing only tester emails, plus a service token for automated acceptance tests | DNS + credential | HTTPS at Cloudflare; only listed testers can reach Operix |
| 4 | In your terminal: `python deploy/scripts/create-runtime-secret.py` — enter the Google Workspace sender, its app password, and the tunnel token | Secret creation | Creates `operix/staging/runtime` (KMS `alias/operix-staging`); nothing is displayed |
| 5 | GitHub (UI, or give me a fine-grained token with Administration + Variables + Environments on this repo): environments `operix-images` and `operix-staging` limited to `main` with you as required reviewer; variables `AWS_ACCOUNT_ID=471112967488`, `OPERIX_ECR_ROLE_ARN=arn:aws:iam::471112967488:role/operix-staging-ImagesRole-Cre96lottIvu`, `OPERIX_DEPLOY_ROLE_ARN=arn:aws:iam::471112967488:role/operix-staging-DeployRole-hkUFlgyl8TM2`, `OPERIX_ARTIFACT_BUCKET=operix-staging-artifactsbucket-obon06ybaj08`, `OPERIX_INSTANCE_ID=i-0ea991afd785b72e0`; then `OPERIX_AWS_ENABLED=true`. Leave `OPERIX_STAGING_DEPLOY_ENABLED` unset | CI/CD | Publishing needs a reviewer click; deployment stays disabled |
| 6 | Run the rendered host bootstrap via SSM (root on the shared host) | Host change | Creates root-owned `/opt/ght/apps/operix`, `/etc/operix/staging.env` (identifiers only), the release receiver, the Operix-only metadata block unit, the AWS CLI snap, the approval sentinel. No Docker daemon, Tontin, proxy or network change |
| 7 | First release: set `OPERIX_STAGING_DEPLOY_ENABLED=true` for one approved run (or I invoke the fixed SSM document with the published release ID) | Deployment | Isolated Postgres/Redis, backup, `prisma migrate deploy`, API/web health, then the tunnel |
| 8 | Owner bootstrap: dry run, then one owner invitation | Writes app data, sends email | See [onboarding](STAFF_ONBOARDING.md) |

After 7–8 I run: health and header checks through Cloudflare, denied-access probes, the bootstrap dry
run, the browser acceptance suite against staging using the Access service token, and the first
scheduled-backup and restore rehearsal. Only then can this report record verified URLs.

## Unresolved risks

| Risk | Severity | Recommendation |
| --- | --- | --- |
| Root EBS volume unencrypted | High for real data | Synthetic staging data only; encrypt via snapshot/replace-root in a maintenance window agreed with Tontin before any staff data |
| IMDS hop limit 2; instance role now includes Operix secret access; **Tontin containers can still reach IMDS** | High | Operix bridges are blocked (step 6). Set hop limit 1 after confirming Tontin does not use the role from containers |
| Shared host: Tontin proxy owns 80/443; Operix mis-routes to Tontin until step 3 | Medium | Tunnel removes the dependency |
| SSH open to `24.184.157.162/32` on the shared security group | Low | Prefer SSM Session Manager; remove when unused |
| SES in sandbox; Gmail SMTP sends only as the authenticated account or an alias | Medium | Use a real mailbox or alias for `no-reply@globalhightech.com`, or move to SES with DKIM |
| KMS key rotation disabled | Low | Enable annual rotation |
| Repository is public (deploy docs reveal host layout) | Low | Keep secrets out of Git (enforced); consider private |
| Lint baseline in progress in the working tree (ESLint config uncommitted) | Low | Land it with step 2 |

## Rollback

- Application: automatic to previous images on failed health checks when migrations are unchanged;
  manual via the fixed SSM document `Mode=rollback` — see [runbook § 3](RUNBOOK.md#3-release-rollback).
- Infrastructure: `operix-staging` stack resources are additive; buckets/repos are retained on deletion.
  Detach `InstanceOperixPolicy` (or delete the stack) to remove all Operix access from the shared role.
- Exposure: disable the Cloudflare tunnel hostnames or Access application — Operix goes dark without
  touching the host.
- Host: `systemctl disable --now operix-imds-block`, remove `/etc/operix/staging.approved` to stop all
  Operix scripts. Tontin is never part of any rollback.
