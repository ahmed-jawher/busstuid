import { parseConfig } from './env';

const base = {
  DATABASE_URL: 'postgres://app@localhost/db',
  DATABASE_SYSTEM_URL: 'postgres://system@localhost/db',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  PHOTO_URL_SECRET: 'c'.repeat(40),
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_KEY: 'priv',
};

describe('parseConfig', () => {
  it('always allows Capacitor origins alongside the configured web origins', () => {
    const config = parseConfig({
      ...base,
      WEB_ORIGINS: 'https://app.example.com, http://localhost:5173',
    });
    expect(config.corsOrigins).toEqual(
      expect.arrayContaining([
        'https://app.example.com',
        'http://localhost:5173',
        'capacitor://localhost',
        'https://localhost',
      ]),
    );
  });

  it('fails loudly when required settings are missing', () => {
    expect(() => parseConfig({})).toThrow(/DATABASE_URL/);
    expect(() => parseConfig({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });
});
