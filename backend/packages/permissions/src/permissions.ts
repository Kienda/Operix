import { MODULE, type ModuleKey } from './modules';

/**
 * The single source of truth for every permission in Operix.
 *
 * Rules:
 *  - Format is always `resource.action` (dots split segments, snake_case within).
 *  - A permission exists here or it does not exist at all — controllers may not
 *    invent ad-hoc strings, and the API refuses to boot if a guard references
 *    an unknown permission.
 *  - Each permission declares the module that owns it so that disabling a
 *    module revokes it everywhere without editing roles.
 */

export interface PermissionDefinition {
  key: string;
  module: ModuleKey;
  description: string;
  /** Sensitive permissions always produce an audit entry and may require MFA. */
  sensitive?: boolean;
}

const define = (
  module: ModuleKey,
  entries: Array<[key: string, description: string, sensitive?: boolean]>,
): PermissionDefinition[] =>
  entries.map(([key, description, sensitive]) => ({
    key,
    module,
    description,
    ...(sensitive ? { sensitive: true } : {}),
  }));

export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = [
  // ---------------------------------------------------------------- platform
  ...define(MODULE.PLATFORM, [
    ['platform.organizations.view', 'View tenant organizations'],
    ['platform.organizations.create', 'Create a tenant organization', true],
    ['platform.organizations.update', 'Update tenant organization records', true],
    ['platform.organizations.suspend', 'Suspend or reactivate a tenant', true],
    ['platform.plans.manage', 'Create and edit subscription plans', true],
    ['platform.subscriptions.manage', 'Assign, change or cancel tenant subscriptions', true],
    ['platform.modules.manage', 'Enable or disable modules for a tenant', true],
    ['platform.feature_flags.manage', 'Manage platform feature flags', true],
    ['platform.admins.manage', 'Manage platform administrators', true],
    ['platform.health.view', 'View system health and queue status'],
    ['platform.usage.view', 'View platform-wide usage metrics'],
    ['platform.security_events.view', 'Review platform security events', true],
    ['platform.support.request_access', 'Request time-boxed support access to a tenant', true],
    ['platform.support.approve_access', 'Approve a support access request', true],
    ['platform.notification_templates.manage', 'Manage global notification templates'],
  ]),

  // -------------------------------------------------------------------- core
  ...define(MODULE.CORE, [
    ['organization.view', 'View organization profile and settings'],
    ['organization.update', 'Update organization profile', true],
    ['settings.manage', 'Manage organization settings, numbering and workflow rules', true],
    ['modules.manage', 'Enable or disable modules the subscription allows', true],
    ['branches.view', 'View branches'],
    ['branches.create', 'Create a branch'],
    ['branches.update', 'Update a branch'],
    ['branches.archive', 'Archive a branch', true],
    ['users.view', 'View organization users'],
    ['users.manage', 'Invite, update, suspend and remove users', true],
    ['users.impersonate', 'Impersonate a user for support purposes', true],
    ['roles.view', 'View roles'],
    ['roles.manage', 'Create roles and assign permissions', true],
    ['permissions.override', 'Grant or revoke user-specific permission overrides', true],
    ['departments.manage', 'Manage departments and positions'],
    ['audit.view', 'View the audit log'],
    ['audit.export', 'Export audit records', true],
  ]),

  // --------------------------------------------------------------------- crm
  ...define(MODULE.CRM, [
    ['customers.view', 'View customers'],
    ['customers.view_all_branches', 'View customers across every branch'],
    ['customers.create', 'Create customers'],
    ['customers.update', 'Update customers'],
    ['customers.archive', 'Archive a customer', true],
    ['customers.view_financials', 'View customer balances and financial history'],
    ['customers.manage_portal', 'Enable or disable customer portal access', true],
    ['leads.view', 'View leads'],
    ['leads.create', 'Create leads'],
    ['leads.update', 'Update leads'],
    ['leads.assign', 'Assign leads to a salesperson'],
    ['leads.convert', 'Convert a lead into a customer'],
    ['leads.archive', 'Archive a lead'],
    ['activities.view', 'View customer and lead activities'],
    ['activities.create', 'Log calls, meetings and notes'],
  ]),

  // ------------------------------------------------------------------- sales
  ...define(MODULE.SALES, [
    ['services.view', 'View the service catalog'],
    ['services.manage', 'Create and edit services and categories'],
    ['quotations.view', 'View quotations'],
    ['quotations.create', 'Create and edit draft quotations'],
    ['quotations.approve', 'Give internal approval to a quotation', true],
    ['quotations.send', 'Send a quotation to a customer'],
    ['quotations.cancel', 'Cancel a quotation', true],
    ['quotations.convert', 'Convert an accepted quotation into a project or invoice'],
    ['quotations.override_pricing', 'Override catalog pricing and discount limits', true],
  ]),

  // --------------------------------------------------------------- contracts
  ...define(MODULE.CONTRACTS, [
    ['contracts.view', 'View contracts'],
    ['contracts.create', 'Draft a contract from a template'],
    ['contracts.update', 'Edit a draft contract'],
    ['contracts.approve', 'Approve a contract for sending', true],
    ['contracts.send', 'Send a contract to the customer'],
    ['contracts.upload_signed', 'Upload a customer-signed contract', true],
    ['contracts.countersign', 'Countersign on behalf of the company', true],
    ['contracts.void', 'Void a contract', true],
    ['contracts.override_gate', 'Override a contract requirement blocking an action', true],
    ['contract_templates.manage', 'Create and edit contract templates', true],
  ]),

  // ---------------------------------------------------------------- projects
  ...define(MODULE.PROJECTS, [
    ['projects.view', 'View projects'],
    ['projects.view_all', 'View every project, not only assigned ones'],
    ['projects.create', 'Create projects'],
    ['projects.update', 'Update projects'],
    ['projects.change_status', 'Change project status', true],
    ['projects.manage_members', 'Add or remove project members'],
    ['projects.view_budget', 'View project budget and profitability'],
    ['projects.archive', 'Archive a project', true],
    ['tasks.view', 'View tasks'],
    ['tasks.create', 'Create tasks'],
    ['tasks.update', 'Update tasks'],
    ['tasks.assign', 'Assign tasks to team members'],
    ['tasks.delete', 'Delete a task'],
    ['milestones.manage', 'Create and edit milestones'],
    ['time_entries.view', 'View logged time'],
    ['time_entries.create', 'Log time'],
    ['time_entries.approve', 'Approve logged time', true],
  ]),

  // ------------------------------------------------------------- work orders
  ...define(MODULE.WORK_ORDERS, [
    ['work_orders.view', 'View work orders'],
    ['work_orders.create', 'Create work orders'],
    ['work_orders.update', 'Update work orders'],
    ['work_orders.approve', 'Approve a work order for execution', true],
    ['work_orders.assign', 'Assign teams and machines'],
    ['work_orders.change_status', 'Advance work-order status'],
    ['work_orders.quality_check', 'Record quality-control results'],
    ['work_orders.deliver', 'Record delivery and completion proof'],
    ['work_orders.cancel', 'Cancel a work order', true],
  ]),

  // ----------------------------------------------------------------- finance
  ...define(MODULE.FINANCE, [
    ['invoices.view', 'View invoices'],
    ['invoices.create', 'Create invoices and pro forma invoices'],
    ['invoices.update', 'Edit a draft invoice'],
    ['invoices.issue', 'Issue an invoice to the customer', true],
    ['invoices.cancel', 'Cancel an issued invoice', true],
    ['payments.view', 'View recorded payments'],
    ['payments.record', 'Record a payment received externally'],
    ['payments.verify', 'Verify a recorded payment', true],
    ['payments.reject', 'Reject a recorded payment', true],
    ['payments.reverse', 'Reverse a verified payment', true],
    ['payments.refund', 'Issue a refund', true],
    ['receipts.view', 'View receipts'],
    ['receipts.issue', 'Generate a receipt'],
    ['credit_notes.manage', 'Create credit and debit notes', true],
    ['balances.view', 'View customer balances and statements'],
    ['expenses.view', 'View expenses'],
    ['expenses.create', 'Submit expenses'],
    ['expenses.approve', 'Approve expenses as a manager', true],
    ['expenses.finance_approve', 'Give finance approval to an expense', true],
    ['expenses.pay', 'Mark an expense as paid', true],
  ]),

  // --------------------------------------------------------------- inventory
  ...define(MODULE.INVENTORY, [
    ['inventory.view', 'View inventory items and stock levels'],
    ['inventory.manage_items', 'Create and edit inventory items'],
    ['inventory.receive', 'Receive stock into a warehouse'],
    ['inventory.reserve', 'Reserve stock for a job'],
    ['inventory.issue', 'Issue materials to a job'],
    ['inventory.return', 'Return unused materials'],
    ['inventory.adjust', 'Adjust stock quantities', true],
    ['inventory.transfer', 'Transfer stock between locations'],
    ['inventory.view_costs', 'View purchase and usage costs'],
    ['inventory.manage_locations', 'Manage warehouses and storage locations'],
    ['rolls.manage', 'Register and consume printing rolls'],
    ['sheets.manage', 'Register and consume sheet materials'],
    ['waste.view', 'View waste records'],
    ['waste.report', 'Report material waste'],
    ['waste.approve', 'Approve a waste record', true],
  ]),

  // ------------------------------------------------------------- procurement
  ...define(MODULE.PROCUREMENT, [
    ['suppliers.view', 'View suppliers'],
    ['suppliers.manage', 'Create and edit suppliers'],
    ['purchase_requests.view', 'View purchase requests'],
    ['purchase_requests.create', 'Raise a purchase request'],
    ['purchase_requests.approve', 'Approve a purchase request', true],
    ['purchase_orders.view', 'View purchase orders'],
    ['purchase_orders.create', 'Create a purchase order'],
    ['purchase_orders.send', 'Send a purchase order to a supplier'],
    ['purchase_orders.receive', 'Record goods received'],
    ['supplier_invoices.manage', 'Record supplier invoices and payments', true],
  ]),

  // -------------------------------------------------------------- production
  ...define(MODULE.PRODUCTION, [
    ['production.view', 'View the production queue'],
    ['production.manage_queue', 'Reorder and prioritise the production queue'],
    ['production.assign', 'Assign machines and operators'],
    ['production.execute', 'Start, pause and complete production stages'],
    ['production.rework', 'Send a job back for rework'],
    ['production.manage_stages', 'Configure production stages', true],
  ]),

  // ------------------------------------------------------------------ assets
  ...define(MODULE.ASSETS, [
    ['assets.view', 'View assets and machines'],
    ['assets.manage', 'Create and edit assets'],
    ['assets.assign', 'Assign an asset to an employee or branch'],
    ['assets.maintenance', 'Record maintenance and repairs'],
    ['assets.dispose', 'Dispose of or write off an asset', true],
  ]),

  // ---------------------------------------------------------------------- hr
  ...define(MODULE.HR, [
    ['employees.view', 'View employee directory'],
    ['employees.view_sensitive', 'View bank details, tax and salary information', true],
    ['employees.create', 'Onboard an employee'],
    ['employees.update', 'Update employee records'],
    ['employees.offboard', 'Offboard an employee', true],
    ['employee_documents.manage', 'Upload and manage employee documents', true],
    ['leave.view', 'View leave requests'],
    ['leave.request', 'Request leave'],
    ['leave.approve', 'Approve or reject leave requests'],
    ['leave.manage_types', 'Configure leave types and balances'],
  ]),

  // ------------------------------------------------------------- attendance
  ...define(MODULE.ATTENDANCE, [
    ['attendance.view', 'View attendance records'],
    ['attendance.view_own', 'View personal attendance'],
    ['attendance.check_in', 'Check in and out'],
    ['attendance.override', 'Override or correct an attendance record', true],
    ['attendance.approve', 'Approve attendance and overtime', true],
    ['attendance.view_location', 'View employee GPS location data', true],
    ['shifts.view', 'View shifts and schedules'],
    ['shifts.manage', 'Create schedules and assign shifts'],
  ]),

  // ---------------------------------------------------------------- payroll
  ...define(MODULE.PAYROLL, [
    ['payroll.view', 'View payroll runs'],
    ['payroll.view_own', 'View own payslips and salary history'],
    ['payroll.process', 'Calculate a payroll run', true],
    ['payroll.review', 'Give HR or department review on a payroll run', true],
    ['payroll.approve', 'Give finance or owner approval on a payroll run', true],
    ['payroll.lock', 'Lock a payroll run', true],
    ['payroll.record_payment', 'Record salary payments', true],
    ['payroll.manage_config', 'Configure salary components and payroll rules', true],
    ['loans.manage', 'Manage employee loans and salary advances', true],
    ['loans.request', 'Request a salary advance'],
  ]),

  // --------------------------------------------------------------- security
  ...define(MODULE.SECURITY, [
    ['security.dashboard.view', 'View the security operations dashboard'],
    ['security.geofences.manage', 'Create and edit geofences', true],
    ['security.assignments.manage', 'Assign guards to posts and shifts'],
    ['security.patrols.manage', 'Configure patrol routes and checkpoints'],
    ['security.patrols.execute', 'Run a patrol and scan checkpoints'],
    ['security.patrols.view', 'View patrol sessions and checkpoint events'],
    ['security.incidents.create', 'Report an incident'],
    ['security.incidents.view', 'View incidents'],
    ['security.incidents.manage', 'Assign, escalate and resolve incidents'],
    ['security.visitors.register', 'Register visitor entry and exit'],
    ['security.visitors.view', 'View visitor logs'],
    ['security.sos.trigger', 'Trigger an emergency SOS'],
    ['security.sos.respond', 'Acknowledge and respond to an SOS', true],
  ]),

  // --------------------------------------------------------------- documents
  ...define(MODULE.DOCUMENTS, [
    ['documents.view', 'View documents in the document center'],
    ['documents.upload', 'Upload documents'],
    ['documents.download', 'Download documents'],
    ['documents.share', 'Share a document with a customer'],
    ['documents.archive', 'Archive a document', true],
    ['documents.manage_retention', 'Configure retention rules', true],
  ]),

  // ----------------------------------------------------------- notifications
  ...define(MODULE.NOTIFICATIONS, [
    ['notifications.view', 'View own notifications'],
    ['notifications.manage_templates', 'Manage organization notification templates'],
    ['notifications.manage_routing', 'Decide which roles receive which alerts', true],
    ['notifications.send_manual', 'Send an ad-hoc notification to a customer or employee'],
    ['notifications.view_deliveries', 'View delivery history and failures'],
  ]),

  // ----------------------------------------------------------------- reports
  ...define(MODULE.REPORTS, [
    ['reports.view', 'View reports'],
    ['reports.view_financial', 'View financial and profitability reports', true],
    ['reports.view_hr', 'View HR and payroll reports', true],
    ['reports.export', 'Export reports to PDF, Excel or CSV'],
    ['reports.build', 'Create and save custom reports'],
  ]),

  // ------------------------------------------------------------------ portal
  ...define(MODULE.PORTAL, [
    ['portal.profile.view', 'Customer: view own profile'],
    ['portal.quotations.view', 'Customer: view own quotations'],
    ['portal.quotations.respond', 'Customer: accept, reject or request changes'],
    ['portal.contracts.view', 'Customer: view own contracts'],
    ['portal.contracts.upload', 'Customer: upload a signed contract'],
    ['portal.projects.view', 'Customer: view own projects and progress'],
    ['portal.approvals.respond', 'Customer: approve or reject deliverables'],
    ['portal.invoices.view', 'Customer: view own invoices and receipts'],
    ['portal.payments.upload_proof', 'Customer: upload proof of payment'],
    ['portal.documents.view', 'Customer: view shared documents'],
    ['portal.support.manage', 'Customer: open and follow support tickets'],
    ['portal.preferences.manage', 'Customer: manage own notification preferences'],
  ]),
];

export const PERMISSIONS: readonly string[] = PERMISSION_DEFINITIONS.map((p) => p.key);

export type Permission = string;

const DEFINITION_BY_KEY = new Map(PERMISSION_DEFINITIONS.map((p) => [p.key, p]));

export function getPermission(key: string): PermissionDefinition | undefined {
  return DEFINITION_BY_KEY.get(key);
}

export function isKnownPermission(key: string): boolean {
  return DEFINITION_BY_KEY.has(key);
}

export function isSensitivePermission(key: string): boolean {
  return DEFINITION_BY_KEY.get(key)?.sensitive === true;
}

export function permissionsForModule(module: ModuleKey): string[] {
  return PERMISSION_DEFINITIONS.filter((p) => p.module === module).map((p) => p.key);
}

export function permissionsForModules(modules: ModuleKey[]): string[] {
  const enabled = new Set<ModuleKey>(modules);
  return PERMISSION_DEFINITIONS.filter((p) => enabled.has(p.module)).map((p) => p.key);
}

export function moduleOfPermission(key: string): ModuleKey | undefined {
  return DEFINITION_BY_KEY.get(key)?.module;
}

/** Throws if any key is not in the catalog. Used at API boot to fail fast. */
export function assertKnownPermissions(keys: string[], context = 'permission set'): void {
  const unknown = keys.filter((k) => k !== '*' && !k.endsWith('.*') && !DEFINITION_BY_KEY.has(k));
  if (unknown.length > 0) {
    throw new Error(`Unknown permissions in ${context}: ${unknown.join(', ')}`);
  }
}
