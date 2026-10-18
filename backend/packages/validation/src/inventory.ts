import { z } from 'zod';
import {
  currencyCode,
  longText,
  mediumText,
  positiveAmount,
  quantity,
  shortText,
  tagsSchema,
  uuid,
} from './common';

export const UNITS = [
  'piece',
  'box',
  'pack',
  'roll',
  'meter',
  'square_meter',
  'sheet',
  'liter',
  'milliliter',
  'kilogram',
  'gram',
  'cartridge',
  'bottle',
] as const;

export const ITEM_KINDS = [
  'raw_material',
  'finished_product',
  'consumable',
  'tool',
  'spare_part',
  'printing_material',
  'construction_material',
  'office_supply',
] as const;

export const inventoryItemSchema = z.object({
  code: z.string().trim().min(1).max(48),
  name: shortText,
  kind: z.enum(ITEM_KINDS).default('raw_material'),
  categoryId: uuid.nullish(),
  description: longText.optional(),
  unit: z.enum(UNITS),
  supplierId: uuid.nullish(),
  purchaseCost: positiveAmount.default('0'),
  usageCost: positiveAmount.default('0'),
  sellingPrice: positiveAmount.default('0'),
  currency: currencyCode,
  minimumStock: quantity.default('0'),
  maximumStock: quantity.nullish(),
  reorderPoint: quantity.default('0'),
  trackBatches: z.boolean().default(false),
  trackRolls: z.boolean().default(false),
  trackSheets: z.boolean().default(false),
  trackExpiry: z.boolean().default(false),
  isActive: z.boolean().default(true),
  tags: tagsSchema,
});
export const updateInventoryItemSchema = inventoryItemSchema.partial();

export const inventoryLocationSchema = z.object({
  branchId: uuid,
  name: shortText,
  code: z.string().trim().max(24).optional(),
  kind: z.enum(['warehouse', 'shelf', 'vehicle', 'production_floor', 'site']).default('warehouse'),
  parentId: uuid.nullish(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const receiveStockSchema = z.object({
  itemId: uuid,
  locationId: uuid,
  quantity: quantity.refine((v) => Number(v) > 0, 'Quantity must be greater than zero'),
  unitCost: positiveAmount.optional(),
  currency: currencyCode.optional(),
  supplierId: uuid.nullish(),
  purchaseOrderId: uuid.nullish(),
  batchNumber: shortText.nullish(),
  lotNumber: shortText.nullish(),
  expiresAt: z.coerce.date().nullish(),
  reference: shortText.nullish(),
  notes: mediumText.optional(),
});

export const issueStockSchema = z.object({
  itemId: uuid,
  locationId: uuid,
  quantity: quantity.refine((v) => Number(v) > 0, 'Quantity must be greater than zero'),
  workOrderId: uuid.nullish(),
  projectId: uuid.nullish(),
  rollId: uuid.nullish(),
  sheetId: uuid.nullish(),
  batchId: uuid.nullish(),
  issuedToUserId: uuid.nullish(),
  notes: mediumText.optional(),
});

export const returnStockSchema = z.object({
  movementId: uuid.nullish(),
  itemId: uuid,
  locationId: uuid,
  quantity: quantity.refine((v) => Number(v) > 0, 'Quantity must be greater than zero'),
  workOrderId: uuid.nullish(),
  condition: z.enum(['good', 'damaged']).default('good'),
  notes: mediumText.optional(),
});

export const reserveStockSchema = z.object({
  itemId: uuid,
  locationId: uuid.nullish(),
  quantity: quantity.refine((v) => Number(v) > 0, 'Quantity must be greater than zero'),
  workOrderId: uuid.nullish(),
  projectId: uuid.nullish(),
  expiresAt: z.coerce.date().nullish(),
  notes: mediumText.optional(),
});

export const transferStockSchema = z.object({
  itemId: uuid,
  fromLocationId: uuid,
  toLocationId: uuid,
  quantity: quantity.refine((v) => Number(v) > 0, 'Quantity must be greater than zero'),
  notes: mediumText.optional(),
});

/** Adjustments always require a reason; they are the one movement type that can create stock from nothing. */
export const adjustStockSchema = z.object({
  itemId: uuid,
  locationId: uuid,
  /** Signed: negative writes stock off. */
  delta: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((v) => /^-?\d{1,15}(\.\d{1,6})?$/.test(v), 'Must be a decimal number')
    .refine((v) => Number(v) !== 0, 'Adjustment cannot be zero'),
  reason: z.enum([
    'stock_count',
    'damage',
    'expiration',
    'theft',
    'correction',
    'initial_stock',
    'other',
  ]),
  note: z.string().trim().min(10, 'Explain the adjustment').max(2000),
});

// -------------------------------------------------------- printing materials

export const rollSchema = z.object({
  itemId: uuid,
  locationId: uuid,
  rollCode: shortText.optional(),
  widthMeters: quantity.refine((v) => Number(v) > 0, 'Width must be greater than zero'),
  originalLengthMeters: quantity.refine((v) => Number(v) > 0, 'Length must be greater than zero'),
  supplierId: uuid.nullish(),
  cost: positiveAmount.optional(),
  currency: currencyCode.optional(),
  receivedAt: z.coerce.date().default(() => new Date()),
  notes: mediumText.optional(),
});

export const consumeRollSchema = z.object({
  lengthMeters: quantity.refine((v) => Number(v) > 0, 'Length must be greater than zero'),
  workOrderId: uuid.nullish(),
  projectId: uuid.nullish(),
  wasteLengthMeters: quantity.default('0'),
  notes: mediumText.optional(),
});

export const sheetBatchSchema = z.object({
  itemId: uuid,
  locationId: uuid,
  sheetCode: shortText.optional(),
  widthMeters: quantity,
  heightMeters: quantity,
  thicknessMm: quantity.optional(),
  originalQuantity: quantity.refine((v) => Number(v) > 0, 'Quantity must be greater than zero'),
  supplierId: uuid.nullish(),
  cost: positiveAmount.optional(),
  currency: currencyCode.optional(),
  receivedAt: z.coerce.date().default(() => new Date()),
  notes: mediumText.optional(),
});

export const consumeSheetSchema = z.object({
  quantity: quantity.refine((v) => Number(v) > 0, 'Quantity must be greater than zero'),
  damagedQuantity: quantity.default('0'),
  workOrderId: uuid.nullish(),
  projectId: uuid.nullish(),
  notes: mediumText.optional(),
});

// ------------------------------------------------------------------- waste

export const WASTE_REASONS = [
  'printing_error',
  'incorrect_dimensions',
  'machine_issue',
  'color_issue',
  'installation_damage',
  'design_error',
  'material_defect',
  'training_waste',
  'customer_change',
  'other',
] as const;

export const wasteSchema = z.object({
  itemId: uuid,
  locationId: uuid.nullish(),
  quantity: quantity.refine((v) => Number(v) > 0, 'Quantity must be greater than zero'),
  unit: z.enum(UNITS),
  workOrderId: uuid.nullish(),
  projectId: uuid.nullish(),
  employeeId: uuid.nullish(),
  assetId: uuid.nullish(),
  rollId: uuid.nullish(),
  sheetId: uuid.nullish(),
  reason: z.enum(WASTE_REASONS),
  photoDocumentIds: z.array(uuid).max(10).default([]),
  notes: mediumText.optional(),
});

export const wasteDecisionSchema = z.object({
  approved: z.boolean(),
  comment: mediumText.optional(),
});

// ------------------------------------------------------------- procurement

export const supplierSchema = z.object({
  name: shortText,
  code: z.string().trim().max(24).optional(),
  contactName: shortText.nullish(),
  email: z.string().email().nullish(),
  phone: z.string().trim().max(24).nullish(),
  country: z.string().trim().length(2).nullish(),
  city: shortText.nullish(),
  addressLine: shortText.nullish(),
  currency: currencyCode,
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(0),
  taxNumber: shortText.nullish(),
  rating: z.coerce.number().int().min(1).max(5).nullish(),
  notes: longText.optional(),
  isActive: z.boolean().default(true),
  tags: tagsSchema,
});
export const updateSupplierSchema = supplierSchema.partial();

export const purchaseRequestSchema = z.object({
  branchId: uuid.nullish(),
  neededBy: z.coerce.date().nullish(),
  justification: mediumText,
  items: z
    .array(
      z.object({
        inventoryItemId: uuid.nullish(),
        description: shortText,
        quantity: quantity,
        unit: z.enum(UNITS),
        estimatedUnitCost: positiveAmount.optional(),
        currency: currencyCode.optional(),
      }),
    )
    .min(1),
});

export const purchaseOrderSchema = z.object({
  supplierId: uuid,
  branchId: uuid.nullish(),
  purchaseRequestId: uuid.nullish(),
  currency: currencyCode,
  expectedAt: z.coerce.date().nullish(),
  deliveryLocationId: uuid.nullish(),
  items: z
    .array(
      z.object({
        inventoryItemId: uuid.nullish(),
        description: shortText,
        quantity: quantity,
        unit: z.enum(UNITS),
        unitCost: positiveAmount,
        taxRate: z.coerce.number().min(0).max(100).default(0),
      }),
    )
    .min(1),
  terms: longText.optional(),
  notes: mediumText.optional(),
});

export const goodsReceiptSchema = z.object({
  receivedAt: z.coerce.date().default(() => new Date()),
  locationId: uuid,
  lines: z
    .array(
      z.object({
        purchaseOrderItemId: uuid,
        receivedQuantity: quantity,
        damagedQuantity: quantity.default('0'),
        batchNumber: shortText.nullish(),
        expiresAt: z.coerce.date().nullish(),
        notes: mediumText.optional(),
      }),
    )
    .min(1),
  deliveryNoteReference: shortText.nullish(),
  notes: mediumText.optional(),
});

// ----------------------------------------------------------------- assets

export const assetSchema = z.object({
  name: shortText,
  code: z.string().trim().max(48).optional(),
  category: z.enum([
    'cnc_machine',
    'uv_printer',
    'dtf_printer',
    'large_format_printer',
    'computer',
    'vehicle',
    'camera',
    'tool',
    'furniture',
    'security_equipment',
    'other',
  ]),
  model: shortText.nullish(),
  serialNumber: shortText.nullish(),
  branchId: uuid.nullish(),
  purchaseDate: z.coerce.date().nullish(),
  purchaseCost: positiveAmount.optional(),
  currency: currencyCode.optional(),
  warrantyUntil: z.coerce.date().nullish(),
  maintenanceIntervalDays: z.coerce.number().int().min(0).max(3650).nullish(),
  lastMaintenanceAt: z.coerce.date().nullish(),
  compatibleItemIds: z.array(uuid).max(100).default([]),
  status: z.enum(['active', 'in_maintenance', 'broken', 'retired', 'disposed']).default('active'),
  notes: longText.optional(),
  tags: tagsSchema,
});
export const updateAssetSchema = assetSchema.partial();

export const assetAssignmentSchema = z.object({
  employeeId: uuid.nullish(),
  branchId: uuid.nullish(),
  assignedAt: z.coerce.date().default(() => new Date()),
  expectedReturnAt: z.coerce.date().nullish(),
  notes: mediumText.optional(),
});

export const maintenanceRecordSchema = z.object({
  kind: z.enum(['preventive', 'corrective', 'inspection', 'calibration']),
  performedAt: z.coerce.date(),
  performedBy: shortText.optional(),
  cost: positiveAmount.optional(),
  currency: currencyCode.optional(),
  downtimeHours: quantity.optional(),
  description: longText,
  nextDueAt: z.coerce.date().nullish(),
  documentIds: z.array(uuid).max(20).default([]),
});

// ------------------------------------------------------------- production

export const productionStageSchema = z.object({
  name: shortText,
  code: z.string().trim().max(32),
  sortOrder: z.coerce.number().int().min(0).default(0),
  requiresQualityCheck: z.boolean().default(false),
  requiresMachine: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const productionAssignSchema = z.object({
  assetId: uuid.nullish(),
  operatorUserIds: z.array(uuid).max(20).default([]),
  scheduledStartAt: z.coerce.date().nullish(),
  scheduledEndAt: z.coerce.date().nullish(),
  notes: mediumText.optional(),
});

export const productionEventSchema = z.object({
  action: z.enum(['start', 'pause', 'resume', 'complete', 'rework']),
  stageId: uuid.nullish(),
  note: mediumText.optional(),
  materialUsage: z
    .array(
      z.object({
        inventoryItemId: uuid,
        quantity: quantity,
        unit: z.enum(UNITS),
        rollId: uuid.nullish(),
        sheetId: uuid.nullish(),
      }),
    )
    .max(100)
    .default([]),
  machineHours: quantity.optional(),
});

export const queueReorderSchema = z.object({
  entries: z
    .array(z.object({ workOrderId: uuid, position: z.coerce.number().int().min(0) }))
    .min(1)
    .max(500),
});
