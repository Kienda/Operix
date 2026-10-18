/**
 * Domain event keys.
 *
 * Every notification template, routing rule and internal alert is addressed by
 * one of these keys. Emitting an event never assumes a channel — routing
 * decides that from organization preferences.
 */

export const EVENT = {
  // sales
  QUOTATION_CREATED: 'quotation.created',
  QUOTATION_SENT: 'quotation.sent',
  QUOTATION_VIEWED: 'quotation.viewed',
  QUOTATION_EXPIRING: 'quotation.expiring',
  QUOTATION_ACCEPTED: 'quotation.accepted',
  QUOTATION_REJECTED: 'quotation.rejected',
  QUOTATION_CHANGES_REQUESTED: 'quotation.changes_requested',
  QUOTATION_APPROVAL_REQUIRED: 'quotation.approval_required',

  // contracts
  CONTRACT_READY: 'contract.ready',
  CONTRACT_SENT: 'contract.sent',
  CONTRACT_VIEWED: 'contract.viewed',
  CONTRACT_SIGNATURE_REMINDER: 'contract.signature_reminder',
  CONTRACT_SIGNED_BY_CUSTOMER: 'contract.signed_by_customer',
  CONTRACT_COUNTERSIGNED: 'contract.countersigned',
  CONTRACT_FULLY_EXECUTED: 'contract.fully_executed',
  CONTRACT_EXPIRING: 'contract.expiring',
  CONTRACT_RENEWAL_APPROACHING: 'contract.renewal_approaching',
  CONTRACT_APPROVAL_REQUIRED: 'contract.approval_required',
  CONTRACT_GATE_OVERRIDDEN: 'contract.gate_overridden',

  // payments
  DEPOSIT_RECEIVED: 'payment.deposit_received',
  PAYMENT_AWAITING_VERIFICATION: 'payment.awaiting_verification',
  PAYMENT_VERIFIED: 'payment.verified',
  PAYMENT_REJECTED: 'payment.rejected',
  PAYMENT_REVERSED: 'payment.reversed',
  PAYMENT_LARGE_RECORDED: 'payment.large_recorded',
  RECEIPT_AVAILABLE: 'payment.receipt_available',
  BALANCE_REMINDER: 'payment.balance_reminder',
  PAYMENT_DUE: 'payment.due',
  PAYMENT_OVERDUE: 'payment.overdue',
  REFUND_ISSUED: 'payment.refund_issued',

  // projects and production
  PROJECT_CREATED: 'project.created',
  PROJECT_STARTED: 'project.started',
  PROJECT_DELAYED: 'project.delayed',
  PROJECT_BLOCKED: 'project.blocked',
  DESIGN_READY: 'project.design_ready',
  CUSTOMER_APPROVAL_REQUIRED: 'project.customer_approval_required',
  PRODUCTION_STARTED: 'production.started',
  QUALITY_CONTROL_COMPLETED: 'production.quality_control_completed',
  READY_FOR_PICKUP: 'work_order.ready_for_pickup',
  READY_FOR_DELIVERY: 'work_order.ready_for_delivery',
  INSTALLATION_SCHEDULED: 'work_order.installation_scheduled',
  DELIVERED: 'work_order.delivered',
  COMPLETED: 'work_order.completed',

  // renewals
  DOMAIN_RENEWAL: 'renewal.domain',
  HOSTING_RENEWAL: 'renewal.hosting',
  MAINTENANCE_RENEWAL: 'renewal.maintenance',
  SUBSCRIPTION_RENEWAL: 'renewal.subscription',

  // crm
  LEAD_CREATED: 'lead.created',
  LEAD_ASSIGNED: 'lead.assigned',
  CUSTOMER_COMPLAINT: 'customer.complaint',

  // inventory
  LOW_STOCK: 'inventory.low_stock',
  WASTE_REPORTED: 'inventory.waste_reported',
  STOCK_ADJUSTED: 'inventory.adjusted',

  // procurement and expenses
  PURCHASE_REQUEST_APPROVAL_REQUIRED: 'procurement.approval_required',
  GOODS_RECEIVED: 'procurement.goods_received',
  EXPENSE_APPROVAL_REQUIRED: 'expense.approval_required',

  // assets
  MAINTENANCE_DUE: 'asset.maintenance_due',

  // hr, attendance and payroll
  PAYROLL_APPROVAL_REQUIRED: 'payroll.approval_required',
  PAYROLL_LOCKED: 'payroll.locked',
  PAYSLIP_AVAILABLE: 'payroll.payslip_available',
  LEAVE_REQUESTED: 'leave.requested',
  LEAVE_DECIDED: 'leave.decided',
  EMPLOYEE_LATE: 'attendance.employee_late',
  SHIFT_MISSED: 'attendance.shift_missed',

  // security
  GUARD_OUTSIDE_GEOFENCE: 'security.guard_outside_geofence',
  CHECKPOINT_MISSED: 'security.checkpoint_missed',
  INCIDENT_REPORTED: 'security.incident_reported',
  INCIDENT_ESCALATED: 'security.incident_escalated',
  SOS_TRIGGERED: 'security.sos_triggered',
  VISITOR_ARRIVED: 'security.visitor_arrived',

  // platform and account security
  LOGIN_SUCCEEDED: 'auth.login_succeeded',
  LOGIN_FAILED: 'auth.login_failed',
  LOGIN_FROM_NEW_DEVICE: 'auth.login_new_device',
  PERMISSION_CHANGED: 'auth.permission_changed',
  SUPPORT_ACCESS_GRANTED: 'platform.support_access_granted',
  SUBSCRIPTION_LIMIT_REACHED: 'platform.subscription_limit_reached',
} as const;

export type EventKey = (typeof EVENT)[keyof typeof EVENT];

/** Events that are addressed to a customer rather than to internal staff. */
export const CUSTOMER_FACING_EVENTS: readonly EventKey[] = [
  EVENT.QUOTATION_SENT,
  EVENT.QUOTATION_EXPIRING,
  EVENT.CONTRACT_READY,
  EVENT.CONTRACT_SENT,
  EVENT.CONTRACT_SIGNATURE_REMINDER,
  EVENT.CONTRACT_COUNTERSIGNED,
  EVENT.CONTRACT_FULLY_EXECUTED,
  EVENT.CONTRACT_EXPIRING,
  EVENT.CONTRACT_RENEWAL_APPROACHING,
  EVENT.DEPOSIT_RECEIVED,
  EVENT.PAYMENT_VERIFIED,
  EVENT.PAYMENT_REJECTED,
  EVENT.RECEIPT_AVAILABLE,
  EVENT.BALANCE_REMINDER,
  EVENT.PAYMENT_DUE,
  EVENT.PAYMENT_OVERDUE,
  EVENT.REFUND_ISSUED,
  EVENT.PROJECT_CREATED,
  EVENT.PROJECT_STARTED,
  EVENT.PROJECT_DELAYED,
  EVENT.DESIGN_READY,
  EVENT.CUSTOMER_APPROVAL_REQUIRED,
  EVENT.PRODUCTION_STARTED,
  EVENT.QUALITY_CONTROL_COMPLETED,
  EVENT.READY_FOR_PICKUP,
  EVENT.READY_FOR_DELIVERY,
  EVENT.INSTALLATION_SCHEDULED,
  EVENT.DELIVERED,
  EVENT.COMPLETED,
  EVENT.DOMAIN_RENEWAL,
  EVENT.HOSTING_RENEWAL,
  EVENT.MAINTENANCE_RENEWAL,
  EVENT.SUBSCRIPTION_RENEWAL,
];

/**
 * Transactional events may always be delivered; anything not in this list is
 * treated as marketing and requires explicit consent.
 */
export const TRANSACTIONAL_EVENTS: ReadonlySet<string> = new Set<string>(
  Object.values(EVENT).filter((e) => !e.startsWith('marketing.')),
);
