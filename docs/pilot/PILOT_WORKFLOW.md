# GHT pilot workflow

What GHT USA and GHT Guinea staff can do in Operix during the pilot, end to end.
Who may perform each step is defined in the [access matrix](ACCESS_MATRIX.md); the server
enforces it, the screens only reflect it. The whole flow below is exercised in a real browser
(`e2e/pilot.spec.mjs`) and through the API (`test/pilot.e2e.test.mjs`) — see [test evidence](TEST_EVIDENCE.md).

## Scope

| Enabled | Customers · Quotations · Projects · Tasks · Team (invitations, roles, branches, suspension) · Audit log · Account security (password, MFA, sign-out) |
| --- | --- |
| Not available | Invoices, payments, receipts, inventory, procurement, HR, payroll, attendance, guards, assets, documents, reports, customer portal, contracts, queued notifications, PDF export |

Languages: English and French (switch per user). Works on desktop and phone.

## The connected flow

```
Invite staff ─► Customer ─► Quotation ─► Sent ─► Accepted ─► Project ─► Tasks ─► Done
                (branch)    (draft)      (send)   (record      (from the    (assign to   (assignee
                                                   decision)    quotation)   staff)       updates)
```

### 1. Staff access (Owner / Administrator)

1. The first owner activates from the emailed one-time link, chooses a password (12+ characters)
   and must enroll two-factor authentication before anything else is available.
2. **Team → Invite**: email, role, branch (USA, Guinea, or both for organization-wide roles).
   Operix emails the invitation; the link is never shown on screen. Links expire after 72 hours,
   work once, and resending revokes the previous link.
3. A person who leaves or loses a device: **Team → Suspend**. All their sessions end immediately.
   Role and branch changes are audited with before/after values.

### 2. Customers (Sales Manager, Sales Rep, Admin, Owner)

- Create a customer in the branch that serves it (USA or Guinea). The customer's branch
  decides where every quotation and project for it lives.
- Sales reps see only customers they created or are assigned to.
- Tax ID and payment terms are visible only to roles allowed to see customer financial fields.
- Customers are archived, not deleted.

### 3. Quotations (Sales)

1. **New quotation** for a customer: title, line items (description, quantity, unit price),
   tax rate, optional validity date and notes. Currency is USD, GNF or EUR (no conversion);
   GNF amounts are whole francs.
2. Totals are computed by the server; numbers (`QUO-2026-0001`) are assigned by the server.
3. Only drafts can be edited. **Mark as sent** freezes the quotation.
4. A manager records the customer's decision — **Record acceptance** or **Record decline**,
   with a reason. A draft or sent quotation can be **cancelled**.

States: Draft → Sent → Accepted | Declined, or Cancelled.

### 4. Projects (Project Manager, Admin, Owner)

1. From an accepted quotation choose **Create project**; the quotation and customer are linked
   automatically. Projects can also be created directly for a customer in the same branch.
2. Lifecycle commands: **Start**, **Put on hold**, **Resume**, **Complete**, **Cancel** — each
   asks for confirmation and is audited.
3. The budget field is visible only to roles allowed to see it.

### 5. Tasks (Project Manager, Production, Admin, Owner; Employees for their own)

1. **New task** on a project: title, assignee, due date, priority. Only activated staff in the
   project's branch can be assigned; a pending invitee cannot.
2. Employees see **only tasks assigned to them** and can move them between *To do*,
   *In progress* and *Done*. They cannot rename or re-plan, and project details are shown as
   "Project (restricted)".

### 6. Oversight (Owner / Administrator)

- **Dashboard**: counts and lists come from live records only — no sample figures.
- **Audit log**: every sign-in-relevant action, access change and workflow command.

## Rules staff should know

- Everything belongs to one branch. A Guinea project needs a Guinea customer.
- Nothing you cannot see is acknowledged: records outside your access show as "not found".
- Status changes only happen through the buttons above, never by editing a field.
- Financial posting and stock movements are switched off for everyone during the pilot.

## Open decisions

The pilot ships with decisions D1–D7 listed in the [access matrix](ACCESS_MATRIX.md#decisions-taken-for-the-pilot--please-confirm-or-change)
(e.g. who records quotation outcomes, whether employees see project names, cross-branch work).
Please confirm or change them before onboarding beyond the first testers.
