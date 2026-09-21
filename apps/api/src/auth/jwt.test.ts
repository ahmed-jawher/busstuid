import { signJwt, verifyJwt } from './jwt';

const SECRET = 'x'.repeat(40);

describe('jwt', () => {
  it('round-trips claims', () => {
    const token = signJwt({ sub: 'user-1', ev: true }, SECRET, 60);
    expect(verifyJwt(token, SECRET)).toMatchObject({ sub: 'user-1', ev: true });
  });

  it('rejects expired tokens, wrong secrets and tampering', () => {
    const past = Date.now() - 120_000;
    expect(verifyJwt(signJwt({ sub: 'u' }, SECRET, 60, past), SECRET)).toBeNull();
    expect(verifyJwt(signJwt({ sub: 'u' }, SECRET, 60), 'y'.repeat(40))).toBeNull();

    const [h, , s] = signJwt({ sub: 'u', ev: false }, SECRET, 60).split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'u', ev: true, iat: 0, exp: 9e9 })).toString(
      'base64url',
    );
    expect(verifyJwt(`${h}.${forged}.${s}`, SECRET)).toBeNull();
  });

  it('rejects alg=none', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'u', exp: 9e9 })).toString('base64url');
    expect(verifyJwt(`${header}.${payload}.`, SECRET)).toBeNull();
  });
});
