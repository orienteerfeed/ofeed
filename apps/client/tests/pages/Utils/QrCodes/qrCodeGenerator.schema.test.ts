import { describe, expect, it } from 'vitest';

import { createQrCodeFormSchema } from '../../../../src/pages/Utils/QrCodes/qrCodeGenerator.schema';
import { MAX_QR_CODES } from '../../../../src/pages/Utils/QrCodes/qrCodeGenerator.utils';

const t = ((key: string) => key) as never;

describe('createQrCodeFormSchema', () => {
  it('accepts a valid range', () => {
    const result = createQrCodeFormSchema(t).safeParse({
      teamFrom: 1,
      teamTo: 10,
      legFrom: 1,
      legTo: 2,
      sizeMm: 45,
    });

    expect(result.success).toBe(true);
  });

  it('rejects teamFrom greater than teamTo', () => {
    const result = createQrCodeFormSchema(t).safeParse({
      teamFrom: 10,
      teamTo: 1,
      legFrom: 1,
      legTo: 1,
      sizeMm: 45,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['teamTo']);
    }
  });

  it('rejects legFrom greater than legTo', () => {
    const result = createQrCodeFormSchema(t).safeParse({
      teamFrom: 1,
      teamTo: 1,
      legFrom: 5,
      legTo: 1,
      sizeMm: 45,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['legTo']);
    }
  });

  it('rejects a range that exceeds the maximum code count', () => {
    const result = createQrCodeFormSchema(t).safeParse({
      teamFrom: 1,
      teamTo: 9999,
      legFrom: 1,
      legTo: 99,
      sizeMm: 45,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['teamTo']);
    }
  });

  it('rejects out-of-bounds primitives', () => {
    expect(
      createQrCodeFormSchema(t).safeParse({
        teamFrom: 0,
        teamTo: 10000,
        legFrom: 0,
        legTo: 100,
        sizeMm: 45,
      }).success,
    ).toBe(false);
  });

  it('rejects an unsupported size', () => {
    expect(
      createQrCodeFormSchema(t).safeParse({
        teamFrom: 1,
        teamTo: 1,
        legFrom: 1,
        legTo: 1,
        sizeMm: 42,
      }).success,
    ).toBe(false);
  });

  it('exposes the configured cap', () => {
    expect(MAX_QR_CODES).toBe(1000);
  });
});
