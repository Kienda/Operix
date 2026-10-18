import { z } from 'zod';
import {
  currencyCode,
  longText,
  mediumText,
  percentage,
  positiveAmount,
  quantity,
  shortText,
  uuid,
} from './common';

export const invoiceItemSchema = z.object({
  serviceId: uuid.nullish(),
  inventoryItemId: uuid.nullish(),
  description: shortText,
  quantity: quantity.refine((v) => Number(v) > 0, 'Quantity must be greater than zero'),
  unit: z.string().trim().max(24).default('piece'),
  unitPrice: positiveAmount,
  discountPercent: percentage.default(0),
  discountAmount: positiveAmount.default('0'),
  taxRate: percentage.default(0),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const invoiceSchema = z.object({
  customerId: uuid,
  branchId: uuid.nullish(),
  projectId: uuid.nullish(),
  quotationId: uuid.nullish(),
  workOrderId: uuid.nullish(),
  kind: z.enum(['invoice', 'proforma']).default('invoice'),
  currency: currencyCode,
  issueDate: z.coerce.date().default(() => new Date()),
  dueDate: z.coerce.date().nullish(),
  items: z.array(invoiceItemSchema).min(1, 'An invoice needs at least one line'),
  globalDiscountPercent: percentage.default(0),
  globalDiscountAmount: positiveAmount.default('0'),
  terms: longText.optional(),
  notes: longText.optional(),
  purchaseOrderReference: shortText.nullish(),
});
export const updateInvoiceSchema = invoiceSchema.partial().omit({ customerId: true });

export const PAYMENT_METHODS = [
  'cash',
  'bank_transfer',
  'orange_money',
  'mtn_mobile_money',
  'check',
  'card_external',
  'ach',
  'wire',
  'other',
] as const;

/**
 * Operix records payments made elsewhere; it never moves money. Verification
 * is a separate, permissioned step from recording.
 */
export const recordPaymentSchema = z.object({
  customerId: uuid,
  branchId: uuid.nullish(),
  amount: positiveAmount.refine((v) => Number(v) > 0, 'Amount must be greater than zero'),
  currency: currencyCode,
  method: z.enum(PAYMENT_METHODS),
  reference: shortText.nullish(),
  paidAt: z.coerce.date(),
  receivedByUserId: uuid.nullish(),
  proofDocumentId: uuid.nullish(),
  notes: mediumText.optional(),
  isDeposit: z.boolean().default(false),
  /**
   * Explicit allocation across invoices. When omitted the service applies the
   * organization's allocation policy (oldest invoice first).
   */
  allocations: z
    .array(
      z.object({
        invoiceId: uuid,
        amount: positiveAmount,
      }),
    )
    .max(50)
    .default([]),
  projectId: uuid.nullish(),
  workOrderId: uuid.nullish(),
});

export const verifyPaymentSchema = z.object({
  approved: z.boolean(),
  /** Required on rejection so the customer can be told why. */
  reason: z.string().trim().max(2000).optional(),
  generateReceipt: z.boolean().default(true),
  notifyCustomer: z.boolean().default(true),
});

export const reversePaymentSchema = z.object({
  reason: z.string().trim().min(20, 'A reversal needs a written reason').max(2000),
  reversedAt: z.coerce.date().default(() => new Date()),
});

export const refundSchema = z.object({
  paymentId: uuid.nullish(),
  customerId: uuid,
  amount: positiveAmount.refine((v) => Number(v) > 0, 'Amount must be greater than zero'),
  currency: currencyCode,
  method: z.enum(PAYMENT_METHODS),
  reference: shortText.nullish(),
  reason: z.string().trim().min(10).max(2000),
  refundedAt: z.coerce.date().default(() => new Date()),
  proofDocumentId: uuid.nullish(),
});

export const creditNoteSchema = z.object({
  customerId: uuid,
  invoiceId: uuid.nullish(),
  kind: z.enum(['credit', 'debit']).default('credit'),
  amount: positiveAmount,
  currency: currencyCode,
  reason: z.string().trim().min(10).max(2000),
  issueDate: z.coerce.date().default(() => new Date()),
  items: z
    .array(
      z.object({
        description: shortText,
        amount: positiveAmount,
      }),
    )
    .max(100)
    .default([]),
});

export const EXPENSE_CATEGORIES = [
  'materials',
  'transportation',
  'fuel',
  'rent',
  'electricity',
  'internet',
  'salaries',
  'maintenance',
  'repairs',
  'marketing',
  'software_subscriptions',
  'hosting',
  'domains',
  'insurance',
  'professional_services',
  'taxes',
  'other',
] as const;

export const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  description: shortText,
  amount: positiveAmount.refine((v) => Number(v) > 0, 'Amount must be greater than zero'),
  currency: currencyCode,
  branchId: uuid.nullish(),
  projectId: uuid.nullish(),
  supplierId: uuid.nullish(),
  vendorName: shortText.nullish(),
  incurredAt: z.coerce.date(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullish(),
  reference: shortText.nullish(),
  receiptDocumentId: uuid.nullish(),
  taxDeductible: z.boolean().default(true),
  notes: mediumText.optional(),
});
export const updateExpenseSchema = expenseSchema.partial();

export const expenseDecisionSchema = z.object({
  approved: z.boolean(),
  comment: mediumText.optional(),
});

export const expensePaySchema = z.object({
  paidAt: z.coerce.date().default(() => new Date()),
  method: z.enum(PAYMENT_METHODS),
  reference: shortText.nullish(),
  proofDocumentId: uuid.nullish(),
});

export const customerStatementQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  currency: currencyCode.optional(),
  includeDrafts: z.coerce.boolean().default(false),
});
