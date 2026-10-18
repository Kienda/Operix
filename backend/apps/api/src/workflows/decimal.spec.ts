import { describe, expect, it } from 'vitest';
import { decimal, money } from './decimal';

describe('posting decimal validation', () => {
  it.each([-1, 0, '0.00', '0.001', NaN, Infinity, '1e2', '', null, {}, '10000000000000000.00'])(
    'rejects invalid positive money %s',
    (value) => expect(() => money(value, 'USD', true)).toThrow(),
  );
  it('adds decimal fractions exactly and supports safe string amounts', () => {
    expect(money('0.10', 'USD').add(money('0.20', 'USD')).toFixed()).toBe('0.3');
    expect(money('9007199254740993.01', 'USD').toFixed()).toBe('9007199254740993.01');
  });
  it('rejects fractional GNF and overprecision stock; permits signed nonzero adjustments', () => {
    expect(() => money('0.01', 'GNF', true)).toThrow();
    expect(() => decimal('0.00001', 4, true)).toThrow();
    expect(decimal('-2.0001', 4, true, true).toFixed()).toBe('-2.0001');
    expect(() => decimal('0', 4, true, true)).toThrow();
  });
});
