import { describe, expect, it } from 'vitest';
import { calculateSubscriptionPrice } from './subscription.util';

describe('subscription pricing', () => {
  it('uses the configured six-month price without a discount', () => {
    expect(calculateSubscriptionPrice(1200, 6, 10)).toEqual({ basePrice: 1200, discountPercent: 0, effectivePrice: 1200 });
  });
  it('applies the configured discount to four six-month periods', () => {
    expect(calculateSubscriptionPrice(1200, 24, 10)).toEqual({ basePrice: 4800, discountPercent: 10, effectivePrice: 4320 });
  });
});
