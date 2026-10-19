import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  MODULE_DEFINITIONS,
  ORGANIZATION_SEED_ROLES,
  ROLE_SCOPE,
  getSystemRole,
} from '../../../permissions/src';

const prisma = new PrismaClient();

/** Every module the API's Module/OrganizationModule tables track. */
const TENANT_MODULES = MODULE_DEFINITIONS.filter((m) => m.key !== 'platform' && m.key !== 'portal');

async function seedModules() {
  await Promise.all(
    TENANT_MODULES.map((definition) =>
      prisma.module.upsert({
        where: { key: definition.key },
        update: { name: definition.name, description: definition.description },
        create: { key: definition.key, name: definition.name, description: definition.description },
      }),
    ),
  );
  return prisma.module.findMany();
}

async function seedOrganization() {
  return prisma.organization.upsert({
    where: { slug: 'global-high-tech' },
    update: {},
    create: {
      name: 'Global High Tech LLC',
      slug: 'global-high-tech',
      status: 'ACTIVE',
      defaultCurrency: 'USD',
      timezone: 'America/New_York',
    },
  });
}

async function seedBranch(organizationId: string) {
  return prisma.branch.upsert({
    where: { organizationId_code: { organizationId, code: 'NYC' } },
    update: {},
    create: {
      organizationId,
      name: 'New York Office',
      code: 'NYC',
      country: 'US',
      currency: 'USD',
      timezone: 'America/New_York',
    },
  });
}

/**
 * Seeds the full Operix system-role catalog (every organization-scoped role
 * from @operix/permissions) into the tenant, with its real permission list —
 * not a `['*']` placeholder. This is what lets the RBAC guard, a future role
 * editor and user invitations work against actual, reviewable permission
 * sets from day one.
 */
async function seedRoles(organizationId: string) {
  const roles = new Map<string, { id: string }>();
  for (const roleKey of ORGANIZATION_SEED_ROLES) {
    const definition = getSystemRole(roleKey);
    if (!definition || definition.scope === ROLE_SCOPE.PLATFORM) continue;
    const role = await prisma.role.upsert({
      where: { organizationId_name: { organizationId, name: definition.name } },
      update: {
        permissions: definition.permissions,
        description: definition.description,
        systemKey: definition.key,
        dataScope: definition.dataScope,
      },
      create: {
        organizationId,
        name: definition.name,
        description: definition.description,
        permissions: definition.permissions,
        systemKey: definition.key,
        dataScope: definition.dataScope,
        isSystem: true,
      },
    });
    roles.set(roleKey, role);
  }
  return roles;
}

async function seedOwner(
  organizationId: string,
  branchId: string,
  ownerRoleId: string,
  email: string,
  password: string,
) {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, status: 'ACTIVE' },
    create: { email, passwordHash, firstName: 'John', lastName: 'Doe' },
  });

  await prisma.organizationUser.upsert({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    update: { roleId: ownerRoleId, isOwner: true },
    create: {
      organizationId,
      userId: user.id,
      roleId: ownerRoleId,
      branchIds: [branchId],
      isOwner: true,
    },
  });

  return user;
}

async function seedUser(
  organizationId: string,
  branchId: string,
  roleId: string,
  email: string,
  firstName: string,
  lastName: string,
  password: string,
  isOwner = false,
) {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, status: 'ACTIVE' },
    create: { email, passwordHash, firstName, lastName },
  });
  await prisma.organizationUser.upsert({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    update: { roleId, branchIds: [branchId], isOwner },
    create: { organizationId, userId: user.id, roleId, branchIds: [branchId], isOwner },
  });
  return user;
}

async function seedDemoTenant(
  name: string,
  slug: string,
  code: string,
  currency: string,
  timezone: string,
) {
  const organization = await prisma.organization.upsert({
    where: { slug },
    update: { name, defaultCurrency: currency, timezone },
    create: { name, slug, status: 'ACTIVE', defaultCurrency: currency, timezone },
  });
  const branch = await prisma.branch.upsert({
    where: { organizationId_code: { organizationId: organization.id, code } },
    update: {},
    create: {
      organizationId: organization.id,
      name: 'Head Office',
      code,
      country: 'US',
      currency,
      timezone,
    },
  });
  const roles = await seedRoles(organization.id);
  await seedModuleEnablement(organization.id, await prisma.module.findMany());
  return { organization, branch, roles };
}

async function seedRecord(
  organizationId: string,
  branchId: string,
  actorId: string,
  module: string,
  type: string,
  number: string,
  name: string,
  status:
    | 'DRAFT'
    | 'PENDING'
    | 'APPROVED'
    | 'ACTIVE'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'ARCHIVED',
  data: object,
) {
  return prisma.businessRecord.upsert({
    where: { organizationId_module_number: { organizationId, module, number } },
    update: { name, status, data, updatedBy: actorId },
    create: {
      organizationId,
      branchId,
      module,
      type,
      number,
      name,
      status,
      data,
      createdBy: actorId,
      updatedBy: actorId,
    },
  });
}

async function seedModuleEnablement(organizationId: string, modules: { id: string }[]) {
  await Promise.all(
    modules.map((module) =>
      prisma.organizationModule.upsert({
        where: { organizationId_moduleId: { organizationId, moduleId: module.id } },
        update: {},
        create: { organizationId, moduleId: module.id },
      }),
    ),
  );
}

async function main() {
  // Demo tenants, shared demo passwords and fabricated records are development-only.
  if (process.env.NODE_ENV === 'production' || process.env.OPERIX_ENVIRONMENT === 'production')
    throw new Error(
      'The development seed must never run in production. Use bootstrap-pilot instead.',
    );
  const modules = await seedModules();
  const organization = await seedOrganization();
  const branch = await seedBranch(organization.id);
  const roles = await seedRoles(organization.id);

  const ownerRole = roles.get('company_owner');
  if (!ownerRole) throw new Error('company_owner role was not seeded — check @operix/permissions');

  const ownerEmail = process.env.PLATFORM_ADMIN_EMAIL ?? 'owner@operix.local';
  const ownerPassword = process.env.PLATFORM_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const owner = await seedOwner(
    organization.id,
    branch.id,
    ownerRole.id,
    ownerEmail,
    ownerPassword,
  );

  await seedModuleEnablement(organization.id, modules);

  const platformDefinition = getSystemRole('platform_super_admin');
  if (platformDefinition) {
    const platformRole = await prisma.role.upsert({
      where: {
        organizationId_name: { organizationId: organization.id, name: platformDefinition.name },
      },
      update: {
        permissions: platformDefinition.permissions,
        systemKey: platformDefinition.key,
        dataScope: platformDefinition.dataScope,
      },
      create: {
        organizationId: organization.id,
        name: platformDefinition.name,
        description: platformDefinition.description,
        permissions: platformDefinition.permissions,
        systemKey: platformDefinition.key,
        dataScope: platformDefinition.dataScope,
        isSystem: true,
      },
    });
    await prisma.organizationUser.update({
      where: { organizationId_userId: { organizationId: organization.id, userId: owner.id } },
      data: { roleId: platformRole.id },
    });
  }

  if (process.env.SEED_DEMO_DATA !== 'false') {
    const password = 'OperixDemo!2026';
    const plan = await prisma.subscriptionPlan.upsert({
      where: { key: 'business' },
      update: {},
      create: {
        key: 'business',
        name: 'Business',
        description: 'Complete Operix operations suite',
        currency: 'USD',
        sixMonthPrice: 1200,
        twentyFourMonthDiscount: 10,
      },
    });
    const atlas = await seedDemoTenant(
      'Atlas Digital SARL',
      'atlas-digital',
      'ATL',
      'USD',
      'Africa/Conakry',
    );
    const ownerRole = atlas.roles.get('company_owner')!;
    const atlasOwner = await seedUser(
      atlas.organization.id,
      atlas.branch.id,
      ownerRole.id,
      'owner@atlas.operix.local',
      'Mamadou',
      'Diallo',
      password,
      true,
    );
    const accounts: Array<[string, string, string, string]> = [
      ['company_admin', 'admin@atlas.operix.local', 'Aissatou', 'Barry'],
      ['finance_manager', 'finance@atlas.operix.local', 'Ibrahima', 'Camara'],
      ['project_manager', 'projects@atlas.operix.local', 'Fatoumata', 'Bah'],
      ['inventory_manager', 'inventory@atlas.operix.local', 'Alpha', 'Sow'],
      ['employee', 'employee@atlas.operix.local', 'Mariama', 'Keita'],
      ['readonly_user', 'viewer@atlas.operix.local', 'Ousmane', 'Conte'],
      ['company_admin', 'admin@demo.operix.local', 'Aissatou', 'Barry'],
      ['sales_manager', 'sales.manager@demo.operix.local', 'Nene', 'Sylla'],
      ['sales_representative', 'sales.rep@demo.operix.local', 'Abdoulaye', 'Toure'],
      ['project_manager', 'project.manager@demo.operix.local', 'Fatoumata', 'Bah'],
      ['hr_manager', 'hr.manager@demo.operix.local', 'Hawa', 'Camara'],
      ['inventory_manager', 'inventory.manager@demo.operix.local', 'Alpha', 'Sow'],
      ['production_manager', 'production.manager@demo.operix.local', 'Mory', 'Kante'],
      ['finance_manager', 'finance.manager@demo.operix.local', 'Ibrahima', 'Camara'],
      ['security_guard', 'security@demo.operix.local', 'Sekou', 'Conde'],
      ['employee', 'employee@demo.operix.local', 'Mariama', 'Keita'],
    ];
    for (const [roleKey, email, first, last] of accounts) {
      const role = atlas.roles.get(roleKey);
      if (!role) throw new Error(`Required demo role was not seeded: ${roleKey}`);
      await seedUser(atlas.organization.id, atlas.branch.id, role.id, email, first, last, password);
    }
    await seedUser(
      atlas.organization.id,
      atlas.branch.id,
      ownerRole.id,
      'owner@demo.operix.local',
      'Mamadou',
      'Diallo',
      password,
      true,
    );
    const customer = await seedRecord(
      atlas.organization.id,
      atlas.branch.id,
      atlasOwner.id,
      'customers',
      'company',
      'CUS-1001',
      'Kipe Business Center',
      'ACTIVE',
      {
        email: 'operations@kipebusiness.example',
        phone: '+224 620 100 200',
        city: 'Conakry',
        accountManager: 'Aissatou Barry',
      },
    );
    const project = await seedRecord(
      atlas.organization.id,
      atlas.branch.id,
      atlasOwner.id,
      'projects',
      'client_project',
      'PRJ-2026-014',
      'Corporate website redesign',
      'IN_PROGRESS',
      {
        customerId: customer.id,
        budget: 18500,
        currency: 'USD',
        deadline: '2026-10-30',
        progress: 58,
      },
    );
    await seedRecord(
      atlas.organization.id,
      atlas.branch.id,
      atlasOwner.id,
      'contracts',
      'service_contract',
      'CTR-2026-009',
      'Website delivery agreement',
      'COMPLETED',
      { customerId: customer.id, projectId: project.id, value: 18500, signedAt: '2026-07-01' },
    );
    await seedRecord(
      atlas.organization.id,
      atlas.branch.id,
      atlasOwner.id,
      'suppliers',
      'supplier',
      'SUP-004',
      'Conakry Print Supplies',
      'ACTIVE',
      { email: 'sales@cps.example', category: 'Printing materials' },
    );
    await seedRecord(
      atlas.organization.id,
      atlas.branch.id,
      atlasOwner.id,
      'expenses',
      'project_expense',
      'EXP-2026-031',
      'Product photography studio rental',
      'APPROVED',
      { projectId: project.id, amount: 650, currency: 'USD' },
    );
    await seedRecord(
      atlas.organization.id,
      atlas.branch.id,
      atlasOwner.id,
      'tasks',
      'task',
      'TSK-2026-088',
      'Review mobile homepage prototype',
      'IN_PROGRESS',
      { projectId: project.id, dueAt: '2026-08-21', priority: 'high' },
    );
    await prisma.inventoryItem.upsert({
      where: {
        organizationId_code: { organizationId: atlas.organization.id, code: 'VINYL-152-WHT' },
      },
      update: {},
      create: {
        organizationId: atlas.organization.id,
        branchId: atlas.branch.id,
        code: 'VINYL-152-WHT',
        name: 'White vinyl roll 1.52m',
        category: 'Printing materials',
        unit: 'm',
        quantity: 42,
        openingQuantity: 42,
        minimumStock: 15,
        cost: 3.8,
        currency: 'USD',
      },
    });
    const invoice = await prisma.invoice.upsert({
      where: {
        organizationId_number: { organizationId: atlas.organization.id, number: 'INV-2026-0042' },
      },
      update: {},
      create: {
        organizationId: atlas.organization.id,
        branchId: atlas.branch.id,
        customerId: customer.id,
        number: 'INV-2026-0042',
        currency: 'USD',
        subtotal: 9250,
        tax: 0,
        total: 9250,
        paid: 4625,
        status: 'PARTIALLY_PAID',
        createdBy: atlasOwner.id,
      },
    });
    await prisma.payment.upsert({
      where: {
        organizationId_number: { organizationId: atlas.organization.id, number: 'PAY-2026-0031' },
      },
      update: {},
      create: {
        organizationId: atlas.organization.id,
        branchId: atlas.branch.id,
        customerId: customer.id,
        number: 'PAY-2026-0031',
        amount: 4625,
        currency: 'USD',
        method: 'BANK_TRANSFER',
        reference: 'ATL-DEP-3107',
        status: 'VERIFIED',
        receivedAt: new Date('2026-07-31'),
        verifiedBy: atlasOwner.id,
        verifiedAt: new Date('2026-07-31'),
        createdBy: atlasOwner.id,
        allocations: { create: { invoiceId: invoice.id, amount: 4625 } },
      },
    });

    const nova = await seedDemoTenant(
      'Nova Construction',
      'nova-construction',
      'NVA',
      'USD',
      'America/New_York',
    );
    const novaOwner = await seedUser(
      nova.organization.id,
      nova.branch.id,
      nova.roles.get('company_owner')!.id,
      'owner@nova.operix.local',
      'Elena',
      'Martinez',
      password,
      true,
    );
    await seedUser(
      nova.organization.id,
      nova.branch.id,
      nova.roles.get('company_admin')!.id,
      'admin@nova.operix.local',
      'Marcus',
      'Reed',
      password,
    );
    await seedUser(
      nova.organization.id,
      nova.branch.id,
      nova.roles.get('employee')!.id,
      'employee@nova.operix.local',
      'Jordan',
      'Lee',
      password,
    );
    await seedRecord(
      nova.organization.id,
      nova.branch.id,
      novaOwner.id,
      'customers',
      'company',
      'CUS-2001',
      'Hudson Community Bank',
      'ACTIVE',
      { city: 'Albany', email: 'facilities@hudsonbank.example' },
    );

    const expired = await seedDemoTenant(
      'Demo Expired Company',
      'demo-expired-company',
      'EXP',
      'USD',
      'America/New_York',
    );
    await seedUser(
      expired.organization.id,
      expired.branch.id,
      expired.roles.get('company_owner')!.id,
      'owner@expired.operix.local',
      'Demo',
      'Owner',
      password,
      true,
    );
    const now = new Date();
    const future = new Date(now);
    future.setUTCMonth(future.getUTCMonth() + 6);
    const longFuture = new Date(now);
    longFuture.setUTCMonth(longFuture.getUTCMonth() + 24);
    const past = new Date(now);
    past.setUTCDate(past.getUTCDate() - 20);
    for (const entry of [
      {
        org: atlas.organization.id,
        months: 6,
        status: 'ACTIVE' as const,
        end: future,
        discount: 0,
        effective: 1200,
      },
      {
        org: nova.organization.id,
        months: 24,
        status: 'ACTIVE' as const,
        end: longFuture,
        discount: 10,
        effective: 4320,
      },
      {
        org: expired.organization.id,
        months: 6,
        status: 'EXPIRED' as const,
        end: past,
        discount: 0,
        effective: 1200,
      },
    ]) {
      const existing = await prisma.subscription.findFirst({
        where: { organizationId: entry.org },
      });
      if (!existing)
        await prisma.subscription.create({
          data: {
            organizationId: entry.org,
            planId: plan.id,
            periodMonths: entry.months,
            status: entry.status,
            basePrice: entry.months === 24 ? 4800 : 1200,
            discountPercent: entry.discount,
            effectivePrice: entry.effective,
            currency: 'USD',
            startsAt: now,
            endsAt: entry.end,
            graceEndsAt: new Date(entry.end.getTime() + 14 * 86400000),
            amountReceived: entry.effective,
            paymentMethod: 'BANK_TRANSFER',
            paymentReference: `DEMO-${entry.org.slice(0, 8)}`,
            approvedBy: owner.id,
            approvedAt: now,
          },
        });
    }
  }

  console.log({
    organizationId: organization.id,
    branchId: branch.id,
    rolesSeeded: roles.size,
    ownerEmail: owner.email,
    // The password is never printed; it comes from PLATFORM_ADMIN_PASSWORD.
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
