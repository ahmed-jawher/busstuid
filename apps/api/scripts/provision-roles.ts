// `pnpm db:roles` — enable login for wusool_app / wusool_system with passwords from the env.
import { provisionLoginRoles } from '../src/database/roles';

const adminUrl = process.env.DATABASE_ADMIN_URL;
const app = process.env.APP_DB_PASSWORD;
const system = process.env.SYSTEM_DB_PASSWORD;
if (!adminUrl || !app || !system) {
  console.error('DATABASE_ADMIN_URL, APP_DB_PASSWORD and SYSTEM_DB_PASSWORD are required.');
  process.exit(1);
}

provisionLoginRoles(adminUrl, { app, system })
  .then(() => console.log('✓ database login roles ready (wusool_app, wusool_system)'))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
