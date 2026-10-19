# GHT pilot — role and access matrix

Source of truth: [`backend/packages/permissions/src/pilot.ts`](../../backend/packages/permissions/src/pilot.ts).
Enforcement: the API (`AccessGuard` → `resolveAuthorization` → scoped queries). The web
app only hides what the server already denies.

## How access is decided (every request)

1. Valid access token **and** a live session bound to the organization (`x-organization-id`).
2. Membership exists, is **ACTIVE** (not suspended) and the user account is active.
3. If the role requires MFA and the user has not enrolled → only sign-out, profile and MFA setup are allowed.
4. Effective permissions = role permissions + active allow overrides − deny overrides, **then removed if
   their module is disabled** — in the database *or* by the deployment ceiling
   `OPERIX_MODULE_ALLOWLIST=core,crm,sales,projects`.
5. Data scope (role) ∩ branch ceiling (membership branches) decides which records exist for the caller.
   Records outside scope return **404**, never 403, so their existence is not confirmed.
6. Sensitive fields are removed from responses and rejected on writes without the field permission.
7. Status changes happen only through audited domain commands, never through generic edits.

## Organization and branches

| Item | Value |
| --- | --- |
| Organization | Global High Tech (`global-high-tech`), default currency USD |
| Branch US | **GHT USA** — USD — America/New_York |
| Branch GN | **GHT Guinea** — GNF — Africa/Conakry |
| Enabled modules | core, crm (customers), sales (quotations), projects (projects, tasks) |
| Disabled | finance (invoices/payments), inventory, procurement, production queue, HR, payroll, attendance, security/guards, assets, documents, notifications, reports, portal, contracts |
| MFA required | Owner, Administrator |

A record belongs to exactly one branch. Tasks inherit their project's branch; a project with a
customer inherits the customer's branch; a quotation inherits its customer's branch.

## Roles

| Role (key) | Scope | Intended for |
| --- | --- | --- |
| Owner (`ght_owner`) | all | GHT leadership; only owners can create owners |
| Administrator (`ght_admin`) | all ∩ branches | Staff access + all pilot records; no organization settings |
| Finance (`ght_finance`) | all ∩ branches | Read-only commercial view incl. customer financial fields and budgets |
| Project Manager (`ght_project_manager`) | branch | Runs every project/task in their branch |
| Sales Manager (`ght_sales_manager`) | branch | Owns customers and quotations; records customer decisions |
| Sales Representative (`ght_sales`) | assigned | Own/assigned customers and own quotations |
| Production (`ght_production`) | branch | Branch projects; plans and runs production tasks |
| Employee (`ght_employee`) | self | Only tasks assigned to them; may change status only |

"all ∩ branches": organization-wide unless the membership lists branches, in which case only those.

## Capability matrix

✅ allowed (within scope) · — denied · 👁 read only

| Capability | Owner | Admin | Finance | Proj. Mgr | Sales Mgr | Sales Rep | Production | Employee |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| See customers | ✅ | ✅ | 👁 | 👁 | ✅ | own/assigned | 👁 | — |
| Create / edit customers | ✅ | ✅ | — | — | ✅ | own/assigned | — | — |
| Archive customers | ✅ | ✅ | — | — | ✅ | — | — | — |
| Customer tax ID / payment terms | ✅ | ✅ | 👁 | hidden | ✅ | hidden | hidden | — |
| See quotations | ✅ | ✅ | 👁 | 👁 | ✅ | own | — | — |
| Create / edit draft quotations | ✅ | ✅ | — | — | ✅ | own | — | — |
| Mark quotation sent | ✅ | ✅ | — | — | ✅ | own | — | — |
| Record acceptance / decline | ✅ | ✅ | — | — | ✅ | — | — | — |
| Cancel quotation | ✅ | ✅ | — | — | ✅ | — | — | — |
| See projects | ✅ | ✅ | 👁 | ✅ | 👁 | — | 👁 | — |
| Create / edit projects | ✅ | ✅ | — | ✅ | — | — | — | — |
| Start / hold / resume / complete / cancel | ✅ | ✅ | — | ✅ | — | — | — | — |
| Project budget | ✅ | ✅ | 👁 | ✅ | hidden | — | hidden | — |
| Archive projects | ✅ | ✅ | — | — | — | — | — | — |
| See tasks | ✅ | ✅ | — | ✅ | — | — | ✅ | assigned only |
| Create / assign tasks | ✅ | ✅ | — | ✅ | — | — | ✅ | — |
| Change task status | ✅ | ✅ | — | ✅ | — | — | ✅ | own: to do / in progress / done |
| Rename / re-plan tasks | ✅ | ✅ | — | ✅ | — | — | ✅ | — |
| Delete (archive) tasks | ✅ | ✅ | — | ✅ | — | — | — | — |
| Invite staff, change roles/branches, suspend | ✅ | ✅ ≤ own access | — | — | — | — | — | — |
| Audit log | ✅ | ✅ | — | — | — | — | — | — |
| Organization settings / branches | ✅ | — | — | — | — | — | — | — |
| Invoices, payments, inventory, HR, attendance | — (module disabled for everyone) | | | | | | | |

## Delegation rules (invitations and access changes)

- A person can only grant a role whose effective permissions, data scope and branches they hold.
- Only owners can invite or assign an owner role; owners cannot be suspended or demoted by others.
- A branch-limited administrator must choose branches inside their own, and only sees/manages
  members of those branches.
- Nobody can change their own access. Every change is audited with before/after values.
- Suspension revokes all of that person's sessions in the organization immediately.

## Decisions taken for the pilot — please confirm or change

| # | Decision | Alternative |
| --- | --- | --- |
| D1 | Recording a customer's acceptance/decline requires `quotations.approve` (managers, admins, owner), not the sales rep who sent it | Allow sales reps to record outcomes |
| D2 | Employees change only task **status**; renaming and re-planning stay with planners | Let assignees edit description/due date |
| D3 | Employees do not see project details for their tasks (shown as "Project (restricted)") | Show the project name to task assignees |
| D4 | Records belong to one branch; projects/quotations must use a customer of the same branch | Allow cross-branch work (e.g. a Guinea project for a US customer) |
| D5 | Project managers and production see **all** projects in their branch | Assigned-projects only |
| D6 | MFA is mandatory for Owner and Administrator; optional for others | Mandatory for Finance as well |
| D7 | Currencies: USD, GNF (whole francs), EUR; no conversion or cross-currency totals | Introduce an exchange-rate policy (needs accounting sign-off) |
