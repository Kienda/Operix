import { describe, expect, it } from 'vitest';
import { validateRecordSchema } from './record-schemas';

describe('customer assignment schema', () => {
  it('recognizes both assignment fields enforced by the authorization policy', () => {
    expect(() =>
      validateRecordSchema('customers', {
        salespersonUserId: 'cda48017-7946-48bc-98bc-906fd2636c13',
        projectManagerUserId: '3886d89b-80db-4327-bb75-a80b33910562',
      }),
    ).not.toThrow();
  });

  it('continues to reject unknown fields', () => {
    expect(() => validateRecordSchema('customers', { arbitraryManager: 'user' })).toThrow(
      'is not a field',
    );
  });
});
