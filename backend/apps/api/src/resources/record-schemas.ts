import { BadRequestException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { money } from '../workflows/decimal';

/**
 * Typed contracts for the JSON payload of pilot record modules. Unknown keys
 * are rejected so that the generic store cannot accumulate unvalidated fields.
 * Modules without a schema keep the earlier (prototype) behavior.
 */
type Check = (value: unknown, key: string) => void;
const fail = (key: string, message: string): never => {
  throw new BadRequestException(`${key}: ${message}`);
};
const text =
  (max: number, pattern?: RegExp, hint?: string): Check =>
  (value, key) => {
    if (typeof value !== 'string') fail(key, 'must be text');
    const v = value as string;
    if (v.length > max) fail(key, `must be at most ${max} characters`);
    if (pattern && v !== '' && !pattern.test(v)) fail(key, hint ?? 'has an invalid format');
  };
const oneOf =
  (...allowed: string[]): Check =>
  (value, key) => {
    if (typeof value !== 'string' || !allowed.includes(value))
      fail(key, `must be one of ${allowed.join(', ')}`);
  };
const date: Check = (value, key) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(key, 'must be a date (YYYY-MM-DD)');
  const parsed = new Date(`${value as string}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    fail(key, 'is not a valid calendar date');
};
const email: Check = (value, key) => {
  if (typeof value !== 'string' || (value !== '' && (!isEmail(value) || value.length > 254)))
    fail(key, 'must be a valid email address');
};
// Reference/user fields are validated for tenant, scope and branch by validateRecordData.
const reference: Check = () => undefined;
const amount: Check = (value, key) => {
  const v = value as { amount?: unknown; currency?: unknown };
  if (!v || typeof v !== 'object' || typeof v.currency !== 'string')
    fail(key, 'must be { amount, currency }');
  money(v.amount, v.currency as string);
  if (Object.keys(v).some((k) => !['amount', 'currency'].includes(k)))
    fail(key, 'only amount and currency are allowed');
};

export const CONTRACT_REQUIREMENTS = [
  'not_required',
  'before_work_starts',
  'before_production',
  'before_material_issue',
  'before_delivery',
  'before_installation',
];

export const RECORD_SCHEMAS: Record<string, Record<string, Check>> = {
  customers: {
    kind: oneOf('company', 'individual'),
    contactName: text(120),
    email,
    phone: text(40, /^[+0-9 ()./-]{4,40}$/, 'must be a phone number'),
    country: text(2, /^[A-Z]{2}$/, 'must be a two-letter country code'),
    city: text(80),
    address: text(300),
    notes: text(2000),
    salespersonUserId: reference,
    // Already part of the scoped authorization model and tenant-user validation.
    projectManagerUserId: reference,
    taxId: text(60),
    paymentTerms: text(120),
  },
  projects: {
    customerId: reference,
    quotationId: reference,
    projectManagerUserId: reference,
    memberUserIds: reference,
    serviceType: text(80),
    description: text(4000),
    startDate: date,
    dueDate: date,
    contractRequirement: oneOf(...CONTRACT_REQUIREMENTS),
    budget: amount,
    holdReason: text(500),
    cancelReason: text(500),
  },
  tasks: {
    projectId: reference,
    assigneeUserId: reference,
    dueDate: date,
    priority: oneOf('low', 'normal', 'high', 'urgent'),
    description: text(4000),
  },
};

/** Which statuses the generic endpoints may set for modules without domain commands. */
export const STATUS_POLICY: Record<string, { create: string[]; update: string[] }> = {
  customers: { create: ['ACTIVE', 'PENDING'], update: ['ACTIVE', 'PENDING'] },
  tasks: {
    create: ['PENDING', 'IN_PROGRESS'],
    update: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  },
};

/** Fields only changeable through domain commands, never via generic PATCH. */
export const COMMAND_FIELDS: Record<string, string[]> = {
  projects: ['holdReason', 'cancelReason'],
};

export function validateRecordSchema(
  module: string,
  data: Record<string, unknown>,
  required: string[] = [],
) {
  const schema = RECORD_SCHEMAS[module];
  if (!schema) return;
  if (JSON.stringify(data).length > 32_000)
    throw new BadRequestException('Record data is too large');
  for (const [key, value] of Object.entries(data)) {
    const check = schema[key];
    if (!check) throw new BadRequestException(`${key}: is not a field of ${module}`);
    if (value !== null) check(value, key);
  }
  for (const key of required)
    if (data[key] == null || data[key] === '') throw new BadRequestException(`${key}: is required`);
  if (
    module === 'projects' &&
    typeof data.startDate === 'string' &&
    typeof data.dueDate === 'string'
  )
    if (data.dueDate < data.startDate)
      throw new BadRequestException('dueDate: must not be before startDate');
}
