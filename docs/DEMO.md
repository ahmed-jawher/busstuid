# Demo accounts

`node dist/ops/cli.js demo` (in the API container) fills an **empty demonstration server** with
one account for every situation a real user can be in, together with trips, alerts and
notifications, so the app can be shown without waiting for a school day.

```bash
# on the server
docker compose -f infra/docker-compose.prod.yml --env-file .env.production \
  exec -T api node dist/ops/cli.js demo
```

Running it twice does nothing: it stops as soon as it finds its own platform-admin account.

## Rules

- **Never run it on a server that holds a real child's data.** Every account shares one password,
  which is printed by the command; anyone who knows it can sign in.
- All names, phone numbers and schools are invented, and the photos are coloured letters, never
  a real child's picture.
- The demo organisations carry "(تجريبية)" in their names so nobody mistakes them for a real
  school in the directory.
- Before the first real school starts, remove the demo data (drop the database and restore from
  a backup, or delete the demo organisations and their accounts by hand).

## What it creates

| Account              | Role         | What you see                                                                    |
| -------------------- | ------------ | ------------------------------------------------------------------------------- |
| `guardian.calm`      | ولي أمر      | Two siblings on one number, this morning's trip completed, a third child absent |
| `guardian.waiting`   | ولي أمر      | A child waiting for the school to approve                                       |
| `guardian.live`      | ولي أمر      | A trip happening right now, the child on board                                  |
| `guardian.alert`     | ولي أمر      | An open critical alert: a child still recorded on the bus                       |
| `guardian.van`       | ولي أمر      | A child with an independent driver instead of a school                          |
| `driver.bus`         | سائق مدرسة   | The morning run finished; the afternoon one is next                             |
| `driver.active`      | سائق مدرسة   | A trip in progress with a child on board                                        |
| `driver.independent` | سائق مستقل   | Runs their own organisation, vehicle and route                                  |
| `driver.waiting`     | سائق         | Waiting for a school to add them                                                |
| `school.admin`       | مدير مدرسة   | Fleet, routes, students, a pending request, an open alert                       |
| `kindergarten.admin` | مديرة روضة   | A kindergarten waiting for platform review                                      |
| `platform.admin`     | مشغّل المنصة | Approves the waiting kindergarten                                               |

All emails end in `@tammeni.demo`.
