import {
  base32Decode,
  base32Encode,
  decryptField,
  encryptField,
  totpCode,
  verifyTotp,
} from './totp';

// RFC 6238 appendix B test vector (SHA-1 key "12345678901234567890").
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors (last 6 digits)', () => {
    expect(totpCode(RFC_SECRET, 59_000)).toBe('287082');
    expect(totpCode(RFC_SECRET, 1_111_111_109_000)).toBe('081804');
    expect(totpCode(RFC_SECRET, 2_000_000_000_000)).toBe('279037');
  });

  it('accepts one step of clock drift, not more', () => {
    const t = 1_700_000_000_000;
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, t - 30_000), t)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, t - 90_000), t)).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef', t)).toBe(false);
  });

  it('round-trips base32', () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });
});

describe('field encryption', () => {
  const key = Buffer.alloc(32, 3).toString('base64');
  it('round-trips and refuses tampering', () => {
    const sealed = encryptField('secret-value', key);
    expect(sealed).not.toContain('secret-value');
    expect(decryptField(sealed, key)).toBe('secret-value');
    const parts = sealed.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptField(parts.join(':'), key)).toThrow();
  });
});
