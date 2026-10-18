# Development demo accounts

Password for every account below: `OperixDemo!2026`. These are created only by the development seed and must never be seeded in production.

Sign in with email and password only — `POST /auth/login` resolves the workspace from the account's own membership. `organizationSlug` is optional and is needed only when one login belongs to more than one active workspace, in which case the API answers `400 WORKSPACE_SELECTION_REQUIRED` with the list of workspaces to choose from.

| Email | Role | Tenant |
|---|---|---|
| owner@atlas.operix.local | Owner | Atlas Digital SARL |
| admin@atlas.operix.local | Company Administrator | Atlas Digital SARL |
| finance@atlas.operix.local | Finance Manager | Atlas Digital SARL |
| projects@atlas.operix.local | Project Manager | Atlas Digital SARL |
| inventory@atlas.operix.local | Inventory Manager | Atlas Digital SARL |
| employee@atlas.operix.local | Employee | Atlas Digital SARL |
| viewer@atlas.operix.local | Read-only User | Atlas Digital SARL |
| owner@nova.operix.local | Owner | Nova Construction |
| admin@nova.operix.local | Company Administrator | Nova Construction |
| employee@nova.operix.local | Employee | Nova Construction |
| owner@expired.operix.local | Owner | Demo Expired Company |

## Role-matrix accounts (Atlas Digital SARL)

| Email | Role |
|---|---|
| owner@demo.operix.local | Company Owner |
| admin@demo.operix.local | Company Administrator |
| sales.manager@demo.operix.local | Sales Manager |
| sales.rep@demo.operix.local | Sales Representative |
| project.manager@demo.operix.local | Project Manager |
| hr.manager@demo.operix.local | Human Resources Manager |
| inventory.manager@demo.operix.local | Inventory Manager |
| production.manager@demo.operix.local | Production Manager |
| finance.manager@demo.operix.local | Finance Manager |
| security@demo.operix.local | Security Guard / Field Staff |
| employee@demo.operix.local | Employee |

All use workspace slug `atlas-digital` and the development-only password shown above.
