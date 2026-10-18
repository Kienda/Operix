# Operix

Operix is Global High Tech's multi-tenant business operations SaaS. The React/Vite client lives at the repository root; the NestJS API, worker, shared RBAC/validation packages, Prisma schema, and deployment infrastructure live in `backend/`.

## Local development

Requirements: Node.js 20+, pnpm 11, Docker Desktop.

```powershell
Copy-Item backend/.env.example backend/.env
Set-Location backend
pnpm install
pnpm infra:up
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm api:dev
```

In a second terminal:

```powershell
npm install
npm run dev
```

The UI is at `http://localhost:5173`, API at `http://localhost:4000/api/v1`, and Swagger at `http://localhost:4000/docs`.

The public website includes the Operix motion journey at `/#operix-advantage` (open `/#website` first if a workspace session is active). `src/operix-motion.jsx` owns Motion for React tokens and illustrations for CRM, projects, finance, team access, inventory and business overview. Stories cover Connect → Organize → Operate → Understand, workspace setup, daily operations and a customer-to-payment workflow. Steps are keyboard accessible; “Follow scroll” resumes automatic emphasis. Reduced motion disables drawing, parallax and translations. Mobile removes parallax and shortens sequencing. These are explanatory illustrations, not live business records.

Demo data is only created when `SEED_DEMO_DATA` is not `false`. Never enable it in production. See [demo accounts](docs/demo-accounts.md), [architecture](docs/architecture.md), and [deployment](docs/deployment.md).
