/**
 * Operix module registry.
 *
 * A module is the unit that a subscription plan enables and that a Company
 * Owner can switch on or off per organization. Every permission belongs to
 * exactly one module, so disabling a module implicitly disables its
 * permissions without touching role definitions.
 */

export const MODULE = {
  CORE: 'core',
  CRM: 'crm',
  SALES: 'sales',
  CONTRACTS: 'contracts',
  PROJECTS: 'projects',
  WORK_ORDERS: 'work_orders',
  FINANCE: 'finance',
  INVENTORY: 'inventory',
  PROCUREMENT: 'procurement',
  PRODUCTION: 'production',
  ASSETS: 'assets',
  HR: 'hr',
  PAYROLL: 'payroll',
  ATTENDANCE: 'attendance',
  SECURITY: 'security',
  DOCUMENTS: 'documents',
  NOTIFICATIONS: 'notifications',
  REPORTS: 'reports',
  PORTAL: 'portal',
  PLATFORM: 'platform',
} as const;

export type ModuleKey = (typeof MODULE)[keyof typeof MODULE];

export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  description: string;
  /** Modules that must also be enabled for this one to function. */
  requires: ModuleKey[];
  /** Core modules can never be disabled for an active organization. */
  mandatory: boolean;
}

export const MODULE_DEFINITIONS: readonly ModuleDefinition[] = [
  {
    key: MODULE.CORE,
    name: 'Core',
    description:
      'Organization, branches, users, roles, permissions, settings and audit. Always enabled.',
    requires: [],
    mandatory: true,
  },
  {
    key: MODULE.PLATFORM,
    name: 'Platform administration',
    description: 'SaaS control plane: tenants, plans, subscriptions, support access, health.',
    requires: [],
    mandatory: false,
  },
  {
    key: MODULE.CRM,
    name: 'CRM',
    description: 'Customers, contacts, leads and the sales pipeline.',
    requires: [MODULE.CORE],
    mandatory: false,
  },
  {
    key: MODULE.SALES,
    name: 'Sales',
    description: 'Service catalog, quotations and proposals.',
    requires: [MODULE.CORE, MODULE.CRM],
    mandatory: false,
  },
  {
    key: MODULE.CONTRACTS,
    name: 'Contracts',
    description: 'Contract templates, versions, signatures and execution gating.',
    requires: [MODULE.CORE, MODULE.CRM],
    mandatory: false,
  },
  {
    key: MODULE.PROJECTS,
    name: 'Projects',
    description: 'Projects, tasks, milestones, time tracking and client approvals.',
    requires: [MODULE.CORE, MODULE.CRM],
    mandatory: false,
  },
  {
    key: MODULE.WORK_ORDERS,
    name: 'Work orders',
    description: 'Execution orders, assignments, quality control and delivery.',
    requires: [MODULE.CORE, MODULE.PROJECTS],
    mandatory: false,
  },
  {
    key: MODULE.FINANCE,
    name: 'Finance',
    description: 'Invoices, manual payments, receipts, refunds, credit notes, expenses.',
    requires: [MODULE.CORE, MODULE.CRM],
    mandatory: false,
  },
  {
    key: MODULE.INVENTORY,
    name: 'Inventory',
    description: 'Items, warehouses, rolls, sheets, movements, material usage and waste.',
    requires: [MODULE.CORE],
    mandatory: false,
  },
  {
    key: MODULE.PROCUREMENT,
    name: 'Procurement',
    description: 'Suppliers, purchase requests, purchase orders and goods receipts.',
    requires: [MODULE.CORE, MODULE.INVENTORY],
    mandatory: false,
  },
  {
    key: MODULE.PRODUCTION,
    name: 'Production',
    description: 'Production queue, stages, machine and operator assignment, quality control.',
    requires: [MODULE.CORE, MODULE.WORK_ORDERS],
    mandatory: false,
  },
  {
    key: MODULE.ASSETS,
    name: 'Assets',
    description: 'Machines, vehicles, tools, assignments and maintenance.',
    requires: [MODULE.CORE],
    mandatory: false,
  },
  {
    key: MODULE.HR,
    name: 'Human resources',
    description: 'Employees, departments, positions, documents and leave.',
    requires: [MODULE.CORE],
    mandatory: false,
  },
  {
    key: MODULE.ATTENDANCE,
    name: 'Attendance',
    description: 'Shifts, schedules, check-in and check-out, corrections and approvals.',
    requires: [MODULE.CORE, MODULE.HR],
    mandatory: false,
  },
  {
    key: MODULE.PAYROLL,
    name: 'Payroll',
    description: 'Payroll periods, runs, earnings, deductions, payslips, loans and advances.',
    requires: [MODULE.CORE, MODULE.HR],
    mandatory: false,
  },
  {
    key: MODULE.SECURITY,
    name: 'Security and field workforce',
    description: 'Geofences, guard assignments, patrols, checkpoints, incidents and visitors.',
    requires: [MODULE.CORE, MODULE.HR, MODULE.ATTENDANCE],
    mandatory: false,
  },
  {
    key: MODULE.DOCUMENTS,
    name: 'Document center',
    description: 'Central secure storage, versions, retention and hashes.',
    requires: [MODULE.CORE],
    mandatory: true,
  },
  {
    key: MODULE.NOTIFICATIONS,
    name: 'Notifications',
    description: 'In-app, email, SMS, WhatsApp and push delivery with templates and preferences.',
    requires: [MODULE.CORE],
    mandatory: true,
  },
  {
    key: MODULE.REPORTS,
    name: 'Reports and analytics',
    description: 'Cross-module reporting and export center.',
    requires: [MODULE.CORE],
    mandatory: false,
  },
  {
    key: MODULE.PORTAL,
    name: 'Customer portal',
    description: 'External customer access to their own quotations, contracts and finances.',
    requires: [MODULE.CORE, MODULE.CRM],
    mandatory: false,
  },
] as const;

const MODULE_BY_KEY = new Map(MODULE_DEFINITIONS.map((m) => [m.key, m]));

export function getModule(key: ModuleKey): ModuleDefinition | undefined {
  return MODULE_BY_KEY.get(key);
}

export function isMandatoryModule(key: ModuleKey): boolean {
  return MODULE_BY_KEY.get(key)?.mandatory ?? false;
}

/**
 * Expands a requested module set to include every transitive dependency.
 * Enabling `production` therefore also enables `work_orders` and `projects`.
 */
export function resolveModuleDependencies(keys: ModuleKey[]): ModuleKey[] {
  const resolved = new Set<ModuleKey>();

  const visit = (key: ModuleKey): void => {
    if (resolved.has(key)) return;
    resolved.add(key);
    for (const dependency of MODULE_BY_KEY.get(key)?.requires ?? []) {
      visit(dependency);
    }
  };

  for (const key of keys) visit(key);
  for (const definition of MODULE_DEFINITIONS) {
    if (definition.mandatory) visit(definition.key);
  }

  return [...resolved];
}

/**
 * Modules that would break if `key` were disabled — surfaced to the Company
 * Owner as a warning before they turn something off.
 */
export function dependentModules(key: ModuleKey): ModuleKey[] {
  return MODULE_DEFINITIONS.filter((m) => m.requires.includes(key)).map((m) => m.key);
}
