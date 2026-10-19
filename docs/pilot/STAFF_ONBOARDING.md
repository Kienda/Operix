# Staff onboarding procedure — GHT pilot

There are no shared passwords, demo accounts or default credentials. Every person activates their
own account from a personal one-time email link. Roles and branches: see the [access matrix](ACCESS_MATRIX.md).

## Prerequisites (once, before the first invitation)

| Gate | Why |
| --- | --- |
| HTTPS hostname approved and live; `APP_URL` set to it | Invitation and reset links point at it |
| SMTP provider approved, sender domain has SPF, DKIM and DMARC | Invitations must arrive and not be spoofable |
| Release gates in the [readiness report](READINESS_REPORT.md) passed | No staff access before then |
| Owner identified (name, work email, phone for out-of-band checks) | Only owners can create owners |

## 1. Bootstrap the organization (operator, once)

Run on the host through the approved operator path — **not** through CI or a broadly logged SSM
command, because on mail failure the command prints the owner's one-time link.

```bash
# After the "Operator shell setup" in RUNBOOK.md (defines `oc`). The API image has no shell;
# node is called directly, with the same secret loader the API uses.
oc exec -T api node --require /opt/operix/runtime-env.cjs dist/cli/bootstrap-pilot.js \
  --owner-email <owner@globalhightech.com> --dry-run
# Review the plan it prints, then run the same command without --dry-run.
```

It creates/updates: organization *Global High Tech*, branches **US** (USD, America/New_York) and
**GN** (GNF, Africa/Conakry), the eight pilot roles, module enablement (`core, crm, sales, projects`),
MFA policy for Owner/Administrator, and **one** owner invitation. It never creates passwords, users
or business records, and it is safe to re-run (an existing active owner skips the invitation).

## 2. Owner activation

1. The owner opens the email, sets a password (≥ 12 characters, not reused).
2. Operix requires two-factor setup: scan the QR code with an authenticator app
   (Microsoft Authenticator, Google Authenticator, 1Password, …) and enter the 6-digit code.
3. The owner confirms they can sign out and back in with the code.

## 3. Invite staff (Owner or Administrator)

For each person, from **Team → Invite**:

| Field | Rule |
| --- | --- |
| Email | Work address only (`@globalhightech.com` or the approved Guinea domain). Never a shared mailbox. |
| Role | Least privilege: start from *Employee* or *Sales Representative* and raise only if needed |
| Branches | USA staff → **GHT USA**; Guinea staff → **GHT Guinea**; both only for organization-wide roles |

Recommended first wave (representative testers, one per role and branch):

| Person | Role | Branch |
| --- | --- | --- |
| Second leader / deputy | Administrator | both |
| USA finance contact | Finance | USA |
| USA project lead | Project Manager | USA |
| Guinea sales lead | Sales Manager | Guinea |
| Guinea sales rep | Sales Representative | Guinea |
| Guinea workshop lead | Production | Guinea |
| Guinea technician | Employee | Guinea |

Confirm each invitation by phone or in person ("you should have an email from Operix now"),
so a mistyped or spoofed address is caught early.

## 4. Staff activation

1. Open the link within 72 hours; set a personal password.
2. Administrators: enroll MFA immediately (required). Others: recommended.
3. Sign in, check that the branch and role shown under **Account** are correct, and report anything
   you can see that you should not.

If the link expired or was lost: the inviter sends a new invitation to the same email from
**Team → Invite**; the previous link stops working. **Revoke** cancels an invitation outright.

## 5. Changes and departures

| Event | Action | Effect |
| --- | --- | --- |
| Role or branch change | Team → member → change role/branches | Audited before/after; takes effect on next request |
| Leave / lost device / suspected compromise | **Suspend** | All sessions revoked immediately |
| Return | Reactivate | Same role and branches as before |
| Lost authenticator (owner/admin) | See [runbook § MFA reset](RUNBOOK.md#mfa-reset-lost-authenticator) | Requires identity check by another owner |
| Forgotten password | "Forgot password" on the sign-in page | Emailed one-time link; existing sessions end |

Nobody can change their own access, and only owners can grant or remove the owner role.

## 6. Monthly access review (Owner)

Export or screenshot **Team** and confirm with each branch lead: every active person still works
there, has the right role, and invitations older than 72 hours are revoked. Record the review date.
