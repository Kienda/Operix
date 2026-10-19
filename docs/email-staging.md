# Operix email staging audit

SMTP already existed in NestJS through Nodemailer and the global MailModule. This change retains React/Vite, Prisma/PostgreSQL and BullMQ. No Tontin resources are changed.

## Workflow inventory

| Workflow | Implementation / outcome |
| --- | --- |
| Invitations and resends | AuthService sends synchronously. SMTP failure now returns an error and revokes the new invitation. A resend already revokes earlier links; retry creates a fresh invitation. |
| Owner bootstrap | Sends synchronously; failure now exits unsuccessfully without printing the bearer link. Retry bootstrap after fixing SMTP. |
| Password reset | Sends synchronously; failure invalidates the new reset token and returns 503. Unknown/inactive accounts receive the generic success response. |
| MFA | TOTP enrollment/confirmation/disable; no email OTP or email recovery implementation. |
| Email verification | No separate email verification flow found. Invitation acceptance proves possession of the invitation link; there is no general verified-email flag or endpoint. |
| Notifications | API stores recipient-scoped in-app records. BullMQ notification.send was a completion stub; unsupported channels now fail rather than claim delivery. Email notification delivery remains unimplemented. Worker is not enabled in staging. |

SMTP acceptance does not establish inbox delivery. There is no bounce processor or delivery receipt integration. A network timeout after provider acceptance is ambiguous; automatic resend is intentionally avoided. SMTP errors use fixed log reasons; provider responses, passwords, message bodies and bearer links are never passed to the mail logger. The development log driver is a simulation, never allowed in production.

## Runtime configuration and secret handling

In /etc/operix/staging.env set:

```sh
SECRET_ID=operix/staging/runtime
MAIL_DRIVER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
MAIL_FROM='Operix <no-reply@globalhightech.com>'
```

Keep SMTP_USER=info@globalhightech.com and SMTP_PASSWORD in the existing Secrets Manager JSON with the other required runtime fields. Never put the password in staging.env, a command argument, CI secrets for tests, or source control. The existing prepare-secrets.py retrieves the secret using the host IAM role, creates the service-specific api.json in a protected release directory, and Compose mounts it read-only. runtime-env.cjs loads it before application imports. Containers cannot obtain the shared host IAM role. Secret rotation requires preparing a new release and restarting API containers; the transport is cached per process.

Production validates SMTP host, username, password and From presence. smtp.gmail.com is restricted to STARTTLS on 587; certificate validation and TLS >=1.2 are explicit. Only NODE_ENV=test with a loopback SMTP host permits plaintext Mailpit, so existing CI uses disposable local SMTP without Google credentials. Unit and mocked integration tests never connect to SMTP.

## Exact staging verification

1. Build and deploy the reviewed Operix release using the existing restricted staging process. Do not dump the runtime secret or run Compose config without --quiet. Confirm the secret's SMTP_USER is info@globalhightech.com and SMTP_PASSWORD is an app password permitted by Workspace policy (not the account login password).
2. In Google Workspace Admin, verify no-reply@globalhightech.com is assigned to info@globalhightech.com as an alias. In that account's Gmail Settings > Accounts > Send mail as, confirm no-reply is configured and verified. If available, Gmail API users.settings.sendAs.list should show that address with verificationStatus=accepted. No access to this account was available during the audit, so this remains a release blocker. SMTP authentication alone cannot prove sender authorization.
3. On the staging host, use the existing privileged deployment session. Select the successfully deployed current Operix release and run:

```sh
set -a
source /etc/operix/staging.env
set +a
RELEASE=$(readlink -f /opt/ght/apps/operix/current)
export IMAGE_TAG=$(basename "$RELEASE")
export RELEASE_SHA="${IMAGE_TAG:0:40}"
export ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com"
export SECRETS_DIR="$RELEASE/runtime"
docker compose --project-name operix-staging --env-file /dev/null -f "$RELEASE/deploy/compose.yml" exec -T api node --require /opt/operix/runtime-env.cjs dist/cli/smtp-check.js
```

This authenticates with STARTTLS but sends no email. It must exit 0. The running API service already has its environment and mounted runtime secret. No database change is made by the check.

4. Choose one mailbox you control, replace the example below with that address in both arguments, and run once:

```sh
docker compose --project-name operix-staging --env-file /dev/null -f "$RELEASE/deploy/compose.yml" exec -T -e SMTP_TEST_RECIPIENT=controlled@example.org -e SMTP_TEST_CONFIRM_RECIPIENT=controlled@example.org api node --require /opt/operix/runtime-env.cjs dist/cli/smtp-check.js
```

5. Confirm receipt in that mailbox, including spam. Inspect raw headers: From must remain Operix <no-reply@globalhightech.com>, without unexpected sender rewriting; inspect SPF, DKIM and DMARC results for the domain. Record timestamp and outcome without credentials or account-action URLs. Do not treat the command's SMTP acceptance as proof of receipt or alias support.
6. Invite a controlled test user and complete acceptance. Request and complete its password reset. Confirm invitation/reset links are absent from logs. Under a controlled mocked transport failure, confirm invitation and reset return errors and the new tokens are invalidated. Do not change shared infrastructure or use real user mailboxes for failure testing.

Local checks: pnpm --dir backend --filter @operix/api test; pnpm --dir backend --filter @operix/api typecheck; python -m unittest discover -s deploy/tests -v. GitHub Actions uses local Mailpit for existing SMTP end-to-end tests and mocks for the new tests; no real SMTP credentials are required.

Remaining security tradeoff: returning delivery failures for existing accounts while unknown accounts receive a generic response can reveal account existence during selective SMTP failures. Existing auth rate limits help but do not eliminate this. A durable reset-request queue with uniform acceptance semantics is a separate design decision; it must not be represented as confirmed email delivery.
