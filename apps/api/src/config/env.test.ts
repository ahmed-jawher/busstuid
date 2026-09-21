import { parseConfig } from './env';

describe('parseConfig', () => {
  it('always allows Capacitor origins alongside the configured web origins', () => {
    const config = parseConfig({
      DATABASE_URL: 'postgres://x@localhost/db',
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

  it('fails loudly when DATABASE_URL is missing', () => {
    expect(() => parseConfig({})).toThrow(/DATABASE_URL/);
  });
});
