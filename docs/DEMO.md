# Test accounts

`node dist/ops/cli.js demo` (in the API container) fills a **demonstration server** with one
account for every situation a real user can be in, together with trips, alerts and notifications,
so the app can be shown and tested without waiting for a school day.

```bash
# on the server — add --reset to delete everything already there first
docker compose -f infra/docker-compose.prod.yml --env-file .env.production \
  exec -T api node dist/ops/cli.js demo --reset
```

Without `--reset` it does nothing once its own accounts exist. With `--reset` it **deletes
everything in the database** — every account, child, trip, alert and audit record — and builds the
test data again from scratch. From GitHub: Actions → "Demo data" → Run workflow, where the same
choice is a tick box.

The accounts are also in [demo-accounts.xlsx](demo-accounts.xlsx) (and
[demo-accounts.csv](demo-accounts.csv)) for handing to a tester; both are written from the code by
`pnpm --filter @wusool/api demo:sheet`, so they cannot drift from what the server actually has.

## Rules

- **Never run it on a server that holds a real child's data**, and delete the test data before the
  first real school starts.
- Every account shares the password **`123456`**. That is deliberate for testing and is the reason
  the previous point exists: anyone who reads this file can sign in.
- Addresses end in **`@t.test`**. `.test` can never be delivered anywhere (RFC 6761), so a
  password-reset code for a test account cannot reach a real person's inbox.
- All names, phone numbers and schools are invented, and the photos are coloured letters, never a
  real child's picture.
- The test organisations carry "(تجريبية)" in their names so nobody mistakes them for a real school
  in the directory.

## The accounts

Password for all of them: `123456`

| Email            | Type           | What has been set up                                                                 |
| ---------------- | -------------- | ------------------------------------------------------------------------------------ |
| `parent1@t.test` | ولي أمر        | Two siblings on one phone number boarded and got off; a third child is absent        |
| `parent2@t.test` | ولي أمر        | A child waiting for the school to approve the link                                   |
| `parent3@t.test` | ولي أمر        | A trip happening right now, the child on board                                       |
| `parent4@t.test` | ولي أمر        | An open critical alert: a child still recorded on the bus                            |
| `parent5@t.test` | ولي أمر        | A child with an independent driver instead of a school                               |
| `parent6@t.test` | ولي أمر        | Added her own driver, who has no account yet: the invitation waits on the child page |
| `driver1@t.test` | سائق مدرسة     | The morning run finished safely; the trip home is next                               |
| `driver2@t.test` | سائق مدرسة     | A trip in progress with a student on board — press "end trip" to see the red refusal |
| `driver3@t.test` | سائق بلا مدرسة | Signed up and waiting for a school to add them                                       |
| `driver4@t.test` | سائق مستقل     | Runs their own organisation, vehicle and route                                       |
| `school@t.test`  | مديرة مدرسة    | Three buses, routes, students, a pending request, an open critical alert             |
| `kg@t.test`      | مديرة روضة     | A kindergarten waiting for platform review                                           |
| `admin@t.test`   | مشغّل المنصة   | Approves the waiting kindergarten                                                    |

Sign-in accepts the email address **or** the phone number; the test accounts' numbers are printed
by the seeder, and the addresses above are the easier way in.
