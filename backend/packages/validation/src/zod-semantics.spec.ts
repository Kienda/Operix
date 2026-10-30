import { describe, expect, it } from 'vitest';
import { metadataSchema } from './common';
import { contractSchema, updateContractSchema } from './contracts';
import { updateCustomerSchema } from './crm';
import {
  assignSubscriptionSchema,
  subscriptionPlanSchema,
  updateSubscriptionPlanSchema,
} from './platform';

const plan = {
  key: 'starter',
  name: 'Starter',
  tier: 'starter',
  limits: { branches: 1, users: 5, storageGb: 1 },
  modules: ['core'],
};

describe('Zod 4 schema semantics', () => {
  it('fills nested defaults when an object with defaults is omitted', () => {
    const parsed = subscriptionPlanSchema.parse(plan);
    expect(parsed.features).toEqual({
      whiteLabel: false,
      apiAccess: false,
      customDomain: false,
      dedicatedSupport: false,
      advancedAudit: false,
      dataMigration: false,
    });
    expect(parsed).toMatchObject({
      monthlyPrice: '0',
      currency: 'USD',
      trialDays: 14,
      isActive: true,
    });
  });

  it('never injects defaults into update payloads', () => {
    expect(updateSubscriptionPlanSchema.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
    expect(updateCustomerSchema.parse({})).toEqual({});
    expect(updateContractSchema.parse({ title: 'Renewal' })).toEqual({ title: 'Renewal' });
  });

  it('still validates and applies nested defaults to supplied update fields', () => {
    expect(
      updateSubscriptionPlanSchema.parse({ features: { apiAccess: true } }).features,
    ).toMatchObject({
      apiAccess: true,
      whiteLabel: false,
    });
    expect(updateSubscriptionPlanSchema.safeParse({ trialDays: 400 }).success).toBe(false);
    expect('customerId' in updateContractSchema.shape).toBe(false);
  });

  it('accepts string-keyed records and defaults them to empty objects', () => {
    expect(metadataSchema.parse(undefined)).toEqual({});
    expect(metadataSchema.parse({ source: 'import', count: 2 })).toEqual({
      source: 'import',
      count: 2,
    });
    expect(metadataSchema.safeParse(['not', 'a', 'record']).success).toBe(false);
    expect(
      assignSubscriptionSchema.parse({ planKey: 'starter', limitOverrides: { users: '7' } })
        .limitOverrides,
    ).toEqual({
      users: 7,
    });
    expect(
      contractSchema.shape.fieldValues.safeParse({ total: 10, signed: true, note: null }).success,
    ).toBe(true);
  });
});
