/**
 * GHT production pilot bootstrap.
 *
 *   node dist/cli/bootstrap-pilot.js --owner-email leader@globalhightech.com [--dry-run]
 *
 * Idempotent. Creates or re-synchronizes: the module catalog, one GHT
 * organization with USA and Guinea branches, the pilot role catalog, pilot-only
 * module enablement and access policy. If the organization has no active owner
 * it issues ONE owner invitation (emailed; printed once only if mail delivery
 * fails). It never creates passwords, demo users or business records.
 */
import 'reflect-metadata';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient, type Prisma } from '@operix/database';
import {
  assertPilotCatalog,
  MODULE_DEFINITIONS,
  PILOT_MODULES,
  PILOT_ROLES,
} from '@operix/permissions';
import { config } from '../platform/config';
import { actionMail, MailService } from '../platform/mail.service';

const ORG = {
  slug: process.env.GHT_ORG_SLUG ?? 'global-high-tech',
  name: process.env.GHT_ORG_NAME ?? 'Global High Tech',
  defaultCurrency: 'USD',
  timezone: 'America/New_York',
};
const BRANCHES = [
  { code: 'US', name: 'GHT USA', country: 'US', currency: 'USD', timezone: 'America/New_York' },
  { code: 'GN', name: 'GHT Guinea', country: 'GN', currency: 'GNF', timezone: 'Africa/Conakry' },
];
const MFA_REQUIRED = ['ght_owner', 'ght_admin'];
const BOOTSTRAP_ACTOR = '00000000-0000-0000-0000-000000000000';

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const ownerEmail = arg('owner-email')?.trim().toLowerCase();
  if (!ownerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail))
    throw new Error('Pass --owner-email <address of the first GHT owner>');
  assertPilotCatalog();
  const settings = config();
  const db = new PrismaClient();
  const plan: string[] = [];
  try {
    await db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        for (const definition of MODULE_DEFINITIONS.filter(
          (m) => !['platform', 'portal'].includes(m.key),
        ))
          await tx.module.upsert({
            where: { key: definition.key },
            update: { name: definition.name, description: definition.description },
            create: {
              key: definition.key,
              name: definition.name,
              description: definition.description,
            },
          });

        const existing = await tx.organization.findUnique({ where: { slug: ORG.slug } });
        const currentSettings = (existing?.settings ?? {}) as Record<
          string,
          Record<string, unknown>
        >;
        const organization = await tx.organization.upsert({
          where: { slug: ORG.slug },
          update: {
            status: 'ACTIVE',
            settings: {
              ...currentSettings,
              security: { ...(currentSettings.security ?? {}), mfaRequiredRoleKeys: MFA_REQUIRED },
              access: {
                ...(currentSettings.access ?? {}),
                assignableRoleKeys: PILOT_ROLES.map((r) => r.key),
              },
            },
          },
          create: {
            ...ORG,
            status: 'ACTIVE',
            settings: {
              security: { mfaRequiredRoleKeys: MFA_REQUIRED },
              access: { assignableRoleKeys: PILOT_ROLES.map((r) => r.key) },
            },
          },
        });
        plan.push(
          `${existing ? 'Updated' : 'Created'} organization ${organization.name} (${organization.slug})`,
        );

        for (const branch of BRANCHES) {
          await tx.branch.upsert({
            where: { organizationId_code: { organizationId: organization.id, code: branch.code } },
            update: { isActive: true },
            create: { ...branch, organizationId: organization.id },
          });
          plan.push(
            `Branch ${branch.code} ${branch.name} (${branch.currency}, ${branch.timezone})`,
          );
        }

        for (const role of PILOT_ROLES) {
          const match = await tx.role.findFirst({
            where: {
              organizationId: organization.id,
              OR: [{ systemKey: role.key }, { name: role.name }],
            },
          });
          // Never silently repurpose an existing role that members may already hold.
          if (match && match.systemKey !== role.key)
            throw new Error(
              `Role name "${role.name}" is already used by role ${match.systemKey ?? match.id}; resolve it manually`,
            );
          const data = {
            name: role.name,
            description: role.description,
            permissions: [...role.permissions],
            dataScope: role.dataScope,
            systemKey: role.key,
            isSystem: true,
          };
          if (match) await tx.role.update({ where: { id: match.id }, data });
          else await tx.role.create({ data: { ...data, organizationId: organization.id } });
          plan.push(
            `Role ${role.name} [${role.key}, scope ${role.dataScope}, ${role.permissions.length} permissions]`,
          );
        }

        for (const module of await tx.module.findMany()) {
          const enabled = PILOT_MODULES.includes(module.key as never);
          await tx.organizationModule.upsert({
            where: {
              organizationId_moduleId: { organizationId: organization.id, moduleId: module.id },
            },
            update: { enabled },
            create: { organizationId: organization.id, moduleId: module.id, enabled },
          });
        }
        plan.push(`Modules enabled: ${PILOT_MODULES.join(', ')}; all others disabled`);

        const owners = await tx.organizationUser.count({
          where: { organizationId: organization.id, isOwner: true, status: 'ACTIVE' },
        });
        if (owners > 0) {
          plan.push(`Owner invitation skipped: ${owners} active owner(s) already exist`);
          if (dryRun) throw new DryRun();
          return;
        }
        const ownerRole = await tx.role.findFirstOrThrow({
          where: { organizationId: organization.id, systemKey: 'ght_owner' },
        });
        await tx.invitation.updateMany({
          where: {
            organizationId: organization.id,
            email: ownerEmail,
            acceptedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        const rawToken = randomBytes(32).toString('base64url');
        const invitation = await tx.invitation.create({
          data: {
            organizationId: organization.id,
            email: ownerEmail,
            tokenHash: createHash('sha256').update(rawToken).digest('hex'),
            roleId: ownerRole.id,
            branchIds: [],
            invitedBy: BOOTSTRAP_ACTOR,
            expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            action: 'BOOTSTRAP_OWNER_INVITED',
            resource: 'invitation',
            resourceId: invitation.id,
            after: { email: ownerEmail },
          },
        });
        plan.push(`Owner invitation for ${ownerEmail} (expires in 72 hours)`);
        if (dryRun) throw new DryRun();
        pendingOwnerLink = {
          url: `${settings.appUrl}/#/accept-invite?token=${rawToken}`,
          organization: organization.name,
        };
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
    plan.push('DRY RUN: rolled back, nothing was written');
  } finally {
    await db.$disconnect();
  }
  for (const line of plan) console.log(`- ${line}`);
  if (pendingOwnerLink) await deliverOwnerLink(ownerEmail, pendingOwnerLink);
}

class DryRun extends Error {}
let pendingOwnerLink: { url: string; organization: string } | undefined;

async function deliverOwnerLink(email: string, link: { url: string; organization: string }) {
  try {
    await new MailService().send({
      to: email,
      subject: `Activate the ${link.organization} Operix owner account`,
      category: 'bootstrap_owner_invitation',
      ...actionMail({
        heading: `Activate ${link.organization} on Operix`,
        intro:
          'You are the first owner of this Operix workspace. Choose a password of at least 12 characters; you will then set up two-factor authentication. The link expires in 72 hours and works once.',
        action: 'Activate owner account',
        url: link.url,
        footer: 'If you did not expect this email, tell your GHT administrator.',
      }),
    });
    console.log(`- Owner invitation emailed to ${email}`);
  } catch {
    throw new Error('Owner invitation email failed; repair SMTP and retry bootstrap');
  }
}

main().catch((error: Error) => {
  console.error(`Bootstrap failed: ${error.message}`);
  process.exit(1);
});
