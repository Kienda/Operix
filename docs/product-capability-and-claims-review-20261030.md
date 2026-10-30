# Operix product capabilities and proposed claims — review before edits

Date: October 30, 2026. Status: audit complete; proposed claims awaiting review.
No product copy, application functionality, module enablement, visual design, Global
High Tech source, infrastructure or deployment was changed in this audit.

## Finding

Operix's intended scope is a comprehensive, configurable business management platform.
The restricted deployment is not the full product definition. `promp.md` explicitly
includes CRM, sales, contracts, projects, work orders, invoices, receipts, manual
payments, inventory, production, procurement, finance, employees, attendance, payroll,
field/security operations, assets, documents, reporting and customer portals.
The module/permission catalog preserves that architecture.

The current landing page describes only the subset enabled for pilot users. That is
a presentation restriction, not evidence that the other domains were removed.
Conversely, Global High Tech's blanket "Development Complete" claims are not supported
by the implementation: several services are backend-only and several full workflows
remain partial or planned. Neither deleting those domains nor claiming every domain
complete is accurate.

The branding merge (`bf7dc4d`, PR #19) has no diff against its first parent under
`backend` or `deploy/compose.yml`. It did replace the pilot landing/card copy and
styling. The earlier broader prototype and its module navigation still exist under
`src/main.jsx`/`src/modules.jsx`, but include sample statistics and incomplete domain
integration. They are not evidence of operational production workflows and should
not simply be enabled as a substitute for a content correction.

## Evidence and limits

Current remote main: `3b70c8754ff4c04335403d1ff5fe3197d9e2f470`.
Read-only SSM confirms the running release remains
`3b70c8754ff4c04335403d1ff5fe3197d9e2f470-41083575411-2`.
Actual API environment ceiling is `core,crm,sales,projects`.

For the synthetic staging tenant, database OrganizationModule flags enable exactly
core, crm, sales and projects. Assets, attendance, contracts, documents, finance, HR,
inventory, notifications, payroll, procurement, production, reports, security and work
orders are disabled at tenant level. The Module catalog entries themselves still
exist and are enabled globally. These observations apply to this tenant and deployment,
not to every tenant or future product configuration.

`security/authorization.ts` intersects tenant/global module enablement with the
deployment ceiling, then applies role/override/branch/record scope. A permission name
alone therefore does not make a feature accessible to a tester. No flag was changed.

Database schema includes purpose-built Invoice, Payment, PaymentAllocation,
InventoryItem and InventoryMovement models, plus tenant/role/module/session/audit
models. BusinessRecord supplies scoped persistence for CRM, contracts, projects,
employees and other domains. A generic model or schema is not a finished workflow.

The October 30 source has more functionality than the original September audit and
October 18 readiness report describe. `docs/workflow-10-remediation.md` documents the
later lead, finance-read/receipt, contract, procurement, goods-receiving and patrol
implementations, and current controllers/tests confirm them. Earlier statements that
those services are absent must not be repeated as current facts.

Existing exact-source CI evidence: [workflow #64](https://github.com/Kienda/Operix/actions/runs/41083575411),
including 152 passing full QA tests across 11 files, 27 P0/migration tests, 52 pilot
API/SMTP tests and 22 browser tests in the inspected first-attempt logs. Attempt 2
also passed all required jobs before the verified publication. This is evidence for
the exercised cases, not certification that every module is complete.

Live authenticated testing is BLOCKED: the user-approved `info@globalhightech.com`
browser remains signed out. No password or MFA secret was obtained, reset, logged or
bypassed. No authenticated dashboard or live synthetic CRUD is called passed.

## Feature matrix and proposed English claims

"Operational subset" below means implemented services/UI with passing source-specific
test evidence. It does not mean the entire broad domain or every intended workflow is
complete. None of the broad modules is certified fully complete by this audit.

| Module | Implemented / actual boundary | Pilot enabled | Proposed wording and label |
| --- | --- | --- | --- |
| CRM | Customer list/detail/create/edit/archive, scoped references and search; lead qualification/conversion backend tested. Full CRM automation/pipeline experience is incomplete. | Customers yes; lead conversion has backend service but no dedicated pilot screen. | **CRM & customers — Available in pilot:** manage customer records and branch ownership. Lead conversion services are implemented; the broader CRM experience is evolving. |
| Sales | Itemized quotations, exact totals/tax, lifecycle commands and scoped links tested; pilot editor/list/detail. Broader service catalog/sales automation is partial. | Quotations yes, by role. | **Sales & quotations — Available in pilot:** prepare quotations, calculate totals and record customer decisions. |
| Invoicing | Invoice creation/list/detail and ledger relationships in finance controller; tested. No complete pilot invoice UI, document/PDF issuance or full credit-note/reversal workflow. | No: finance disabled and outside ceiling. | **Invoicing — Restricted access:** invoice services are implemented; the complete invoicing interface and document workflow are coming soon. |
| Inventory | Item services, movement history, receipt/issue/return/waste/adjustment ledger, idempotency and concurrent overdraw checks tested. Paired transfers/reservations explicitly refused. | No. | **Inventory & materials — Restricted access:** stock and movement services are implemented. Transfer, reservation and broader production-material workflows are coming soon. |
| Projects | Pilot create/edit/detail, accepted-quote links, lifecycle, members and task flows tested. Milestone persistence exists; broader scheduling/time/client approvals partial. | Projects/tasks yes, by role. | **Projects & tasks — Available in pilot:** connect customer work, quotations, project progress and assigned tasks. |
| Finance | Exact-decimal balances, currency-grouped summary, expense approval and permission/scope checks tested. Complete accounting, reconciliation, tax reporting and reversals are not established. | Finance no; pilot dashboard's operational metrics yes. | **Finance — Restricted access:** connect invoice balances, manual payment verification and expense approvals. Broader accounting workflows remain in development. |
| Employees | Core user invitations, activation, roles, branch scope, suspension/account security and assigned tasks work in pilot. Separate HR employee records/sensitive projections exist; leave/payroll lifecycle incomplete. | Team/access yes under core; HR employee module no. | **People & employees — Available in pilot for team access:** invitations, roles and work assignments. HR records have restricted access; broader HR/payroll workflows are coming soon. |
| Field operations | Attendance/geofence check-in/out/review, guard assignment, route/checkpoint scans and incident/visitor records have backend test coverage. No complete pilot field UI, native/offline app or signed-QR system. | No: attendance/security disabled. | **Field operations — Restricted access:** attendance and patrol services are implemented. The broader mobile field experience is coming soon. |
| Payments | Manual recording, allocations, role-separated verification, replay/concurrency protection and numbered receipt data tested. No evidence of an integrated online payment gateway or complete refund/reversal lifecycle. | No: finance disabled. | **Payments & receipts — Restricted access:** record and verify manual payments and retrieve receipt information. Do not describe online payment processing as available. |
| Contracts | Generic scoped contract records plus dedicated approval, signed-document-reference and countersign transitions; tested actual project-start gate. Secure file-transfer/e-signature experience is incomplete. | No: contracts and documents disabled. | **Contracts — Restricted access:** approval, signed-document references and execution gates are implemented. The complete document-signing experience is coming soon. |
| Production / work orders | Module catalog, permissions, metadata persistence and prototype views exist. No complete production planning, material-consumption, machine scheduling, QC and delivery chain verified. | No. | **Production & work orders — Coming soon:** planned connected production execution, building on existing record and permission foundations. |
| Reporting / insights | Live permission-scoped dashboard counts and currency-separated financial summary exist. Generic report metadata exists; report.export worker returns a placeholder, not an exported artifact. | Operational dashboard yes; reports module/exports no. | **Insights — Available in pilot for operational dashboards:** advanced reporting and exports are coming soon. |
| Procurement / suppliers | Supplier/request/order records; approval/send/transactional partial receiving with replay and planned-quantity checks tested. Complete purchasing UI and broader commercial lifecycle incomplete. | No. | **Procurement — Restricted access:** purchasing approval and goods-receiving services are implemented; the complete purchasing workspace is coming soon. |
| Roles / permissions | Core membership, exact capabilities, overrides, tenant/branch/assigned/self scopes, invitations and audit; tested backend and pilot UI. | Yes, by administrator capability. | **Roles & permissions — Available in pilot:** control team access by role, branch and assigned work. |
| Payroll | Metadata/schema/permission foundation and prototype views; no verified payroll engine, authoritative payroll calculation or payslip artifact. | No. | **Payroll — Coming soon.** Do not claim payroll processing or payment execution is operational. |
| Documents / notifications / portal | Contract document metadata and scoped read-only customer portal services exist. Auth SMTP invitations/resets operate independently. Secure document center, multichannel notifications and worker exports/rendering are incomplete. | Core auth mail yes; these product modules no. | Retain these domains in the roadmap; describe the implemented service specifically and label incomplete user-facing workflows **Coming soon**. |

Source evidence: `backend/apps/api/src/app.module.ts`; workflow controllers for
finance, inventory, quotations, projects, contracts, attendance, patrols, lead conversion,
expense/procurement approvals and goods receiving; `resources/resources.controller.ts`,
`record-schemas.ts` and `resources.service.ts`; `platform/workspace.controller.ts`;
`backend/packages/database/prisma/schema.prisma`; `backend/packages/permissions/src/`;
`backend/apps/api/test/qa/` and `test/p0.e2e.test.mjs`; `src/pilot/api.js`, `PilotApp.jsx`
and `screens/`; `backend/apps/worker/src/main.ts`.

## Proposed content structure — not applied

Keep the exact requested English hero and description:

> Manage everything. Grow everywhere.
>
> Connect customers, projects, finance, inventory, people, and field operations in one secure business platform.

Keep the navy/teal gradient, teal/gold identity, Montserrat/Inter, responsive modern
cards and invitation-only login. No product module or backend route is to be deleted
or enabled by this content correction. No prototype/mock-data app is to be deployed.

Change the module-section frame from "What your team can use today" to:

| Location | Proposed English | Proposed French |
| --- | --- | --- |
| Section heading | Connected business operations | Des opérations d’entreprise connectées |
| Section introduction | Operix connects customer relationships, commercial work, delivery, resources and business information. Access and supported workflows vary by module and deployment. | Operix relie les relations clients, l’activité commerciale, la réalisation des projets, les ressources et les informations de gestion. L’accès et les parcours disponibles varient selon le module et le déploiement. |
| Availability explanation | Product capabilities and pilot access are different. The current invitation-only pilot enables customer management, quotations, projects, tasks and team access. Other domains remain part of Operix, with the implementation and access status shown below. | Les capacités du produit et l’accès au pilote sont distincts. Le pilote actuel, accessible sur invitation, active la gestion des clients, les devis, les projets, les tâches et les accès de l’équipe. Les autres domaines restent dans le périmètre d’Operix, avec le niveau de réalisation et d’accès indiqué ci-dessous. |
| Label legend | Available · Available in pilot · Restricted access · Coming soon | Disponible · Disponible dans le pilote · Accès restreint · À venir |
| Product status on GHT | Business management platform in active development. Access and supported workflows vary by module. | Plateforme de gestion d’entreprise en développement actif. L’accès et les parcours disponibles varient selon le module. |
| Portfolio visual caption | Current Operix public interface: navy and teal with gold accents. Public screenshots; no private workspace data shown. | Interface publique actuelle d’Operix : bleu nuit et turquoise, avec des accents dorés. Captures publiques ; aucune donnée d’espace privé présentée. |

Reserve "Available" for a specifically verified generally accessible feature; it is
not proposed as a blanket domain label here. "Restricted access" must always be
accompanied by the backend/user-interface boundary in the matrix, so visitors do not
infer that a complete UI appears merely by requesting a role change.

French card equivalents, preserving the same limitations:

| Domain | Proposed French claim |
| --- | --- |
| CRM | **CRM et clients — Disponible dans le pilote :** gérez les fiches clients et leur agence de rattachement. Les services de conversion des prospects sont réalisés ; l’expérience CRM complète continue d’évoluer. |
| Sales | **Ventes et devis — Disponible dans le pilote :** préparez des devis, calculez les totaux et enregistrez la décision du client. |
| Invoicing | **Facturation — Accès restreint :** les services de facturation sont réalisés ; l’interface complète et le parcours documentaire sont à venir. |
| Inventory | **Stocks et matières — Accès restreint :** les services de stock et de mouvements sont réalisés. Les transferts, réservations et parcours de matières de production sont à venir. |
| Projects | **Projets et tâches — Disponible dans le pilote :** reliez clients, devis, progression des projets et tâches attribuées. |
| Finance | **Finances — Accès restreint :** reliez soldes des factures, vérification des paiements manuels et approbation des dépenses. Les parcours comptables plus larges restent en développement. |
| People | **Équipes et employés — Disponible dans le pilote pour les accès de l’équipe :** invitations, rôles et affectations. Les dossiers RH sont à accès restreint ; les parcours RH et paie plus larges sont à venir. |
| Field | **Opérations terrain — Accès restreint :** les services de présence et de patrouille sont réalisés. L’expérience mobile terrain plus large est à venir. |
| Payments | **Paiements et reçus — Accès restreint :** enregistrez et vérifiez les paiements manuels et consultez les informations de reçu. Ne pas présenter un traitement de paiement en ligne comme disponible. |
| Contracts | **Contrats — Accès restreint :** les approbations, références de documents signés et contrôles d’exécution sont réalisés. L’expérience complète de signature documentaire est à venir. |
| Production | **Production et ordres de travail — À venir :** exécution de production connectée prévue, sur les fondations existantes de dossiers et d’autorisations. |
| Insights | **Indicateurs — Disponible dans le pilote pour les tableaux de bord opérationnels :** les rapports avancés et les exports sont à venir. |
| Procurement | **Achats — Accès restreint :** les services d’approbation et de réception sont réalisés ; l’espace achats complet est à venir. |
| Permissions | **Rôles et autorisations — Disponible dans le pilote :** contrôlez les accès par rôle, agence et travail attribué. |
| Payroll | **Paie — À venir.** |

## Global High Tech alignment review

Repository inspected read-only: `F:/Projects/globalhightech`. Sixteen uncommitted files
were recorded with hashes and preserved. Several already contain Operix content and
mockup changes; any later correction must be a narrow patch on top of that working
tree, not a reset/checkout or replacement of those files.

| Surface | Observed discrepancy | Proposed correction after review |
| --- | --- | --- |
| `/operix`, `(en)/operix/page.tsx` | Broad domain coverage retained, but "Operix development is complete" and unqualified availability. | Keep Customers, Projects, Contracts, Inventory, Employees, Payments, Operations and Insights. Add evidence-based availability and the explicit implementation boundary. |
| Homepage, `components/home/operix-section.tsx` and `lib/i18n/dictionary.ts` | English/French "Development Complete" / "Développement terminé". Broad tags include Contracts, Inventory and Payments. | Retain domains and connected-platform positioning; use the proposed status and availability summary in both languages. |
| `config/site.ts` | Shared OPERIX.status says Development Complete. | Align status; do not silently reinterpret an old owner-confirmation comment as evidence of completed workflows. |
| `/work/operix`, `/fr/work/operix`, `config/portfolio.ts` | Broad scope correctly retained; prose asserts completion and describes former blue accents. | Keep feature tags; qualify status; describe approved navy/teal/gold identity. |
| `components/work/project-mockup.tsx`, `components/work/portfolio.tsx` | Mockup/case-study captions say Development complete in both languages. | Replace completion caption with a factual interface/capture caption; retain current uncommitted framing work. |
| Public mockup assets | Live case study still depicts earlier blue interface. Local image assets have uncommitted changes. | Review existing changed assets first; use new public screenshots only after review, without overwriting unrelated artwork. |
| `/terms`, `(en)/terms/page.tsx` | Also repeats development complete. | Include this shared claim in the review; no legal text edited in this audit. |
| French `/operix` | `/operix` is absent from TRANSLATED_PATHS; there is no French product-page source. French homepage and case study exist. | Do not pretend `/fr/operix` is translated. A French product route would require a separately reviewed route/content addition. |

## Playwright observations

Read-only browser audit: `tmp/product-scope-audit/browser-report.json`.
Operix English/French hero, six module cards, descriptions and login were inspected.
HTML language follows the selector, login has email/password and no public registration
link. Landing layouts were inspected at 1440, 1024, 768, 390 and 375 px in both
languages. Zero page exceptions occurred in this audit.

- The six cards are consistent between languages, but omit the wider product domains.
- The hero and supporting positioning already match the user's requested scope.
- English widths passed overflow checks; French 375px overflows by roughly 3px.
  A second settled-layout check measured scrollWidth 378 at width 375, caused by
  `.px-lp-header-actions`/Login extending beyond the right edge. No CSS fix was made
  before review. This is a separate layout issue, not a reason to shorten product scope.
- Global High Tech `/`, `/operix`, `/work/operix`, `/fr` and `/fr/work/operix` returned
  200 and showed the documented claims. `/fr/operix` navigation did not complete;
  it is recorded BLOCKED, not as a verified live 404. Source independently shows
  there is no translated product route.
- Authenticated application/dashboard and synthetic workflow tests are BLOCKED on
  manual tester authentication. Static pilot routes and existing CI browser/API tests
  were reviewed, but no new live authenticated result is invented.

Public screenshots: `operix-en-1440.png`, `operix-fr-1440.png`,
`operix-en-375.png`, `operix-fr-375.png` and `ght-*.png` under the same directory.
No business data was created, updated or deleted.

## Review boundary

Review the matrix, English/French wording and portfolio changes above before applying
product claims. The proposed correction restores comprehensive positioning while
separating access restrictions from implementation maturity. It does not promise
unfinished workflows, remove domains, enable disabled modules, change roles, or
restart development of the existing platform.

After claims review: make only the approved content/layout patches, retain the visual
identity, run translation/build/content and Playwright checks, present the implementation
diff for review, and keep deployment disabled until that revised implementation is
approved. No PR, merge, publication or deployment was performed in this audit.
