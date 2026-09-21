import { Client } from 'pg';

/**
 * Gives the roles created by the init migration LOGIN and a password. Run after migrations
 * (setup, deploy, tests). Idempotent: re-running just resets the passwords.
 */
export async function provisionLoginRoles(
  adminUrl: string,
  passwords: { app: string; system: string },
): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const db = (await client.query<{ db: string }>('SELECT current_database() AS db')).rows[0]!.db;
    for (const [role, password] of [
      ['wusool_app', passwords.app],
      ['wusool_system', passwords.system],
    ] as const) {
      await client.query(
        `ALTER ROLE ${client.escapeIdentifier(role)} LOGIN PASSWORD ${client.escapeLiteral(password)}`,
      );
      await client.query(
        `GRANT CONNECT ON DATABASE ${client.escapeIdentifier(db)} TO ${client.escapeIdentifier(role)}`,
      );
    }
  } finally {
    await client.end();
  }
}

/** Builds a connection URL for `role` on the same server/database as `adminUrl`. */
export function roleUrl(adminUrl: string, role: string, password: string): string {
  const url = new URL(adminUrl);
  url.username = role;
  url.password = password;
  return url.toString();
}
