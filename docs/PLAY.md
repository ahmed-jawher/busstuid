# Google Play submission — the answers, ready

Everything Play asks for, answered against what the code actually does. Go through it in order;
the parts marked **(owner)** cannot be done from the repository.

## 0. Before the first upload — the three that cannot be undone

| Decision       | Now                                           | Can it change later?                                  |
| -------------- | --------------------------------------------- | ----------------------------------------------------- |
| App id         | `com.tammeni.app`                             | **Never**, once uploaded                              |
| API address    | baked into the Android build (`VITE_API_URL`) | Only with a new release                               |
| Account holder | personal or a registered entity **(owner)**   | Transfer is possible but slow, and the name is public |

The app id already matches the brand. Build against the **domain**, never the raw IP.

## 1. Build the file Play accepts

CI builds a **debug APK** on every pull request — that is for testing on a phone, not for Play.
Play needs a **signed AAB**:

```bash
VITE_API_URL=https://tammene.com/v1 pnpm --filter @wusool/web native:sync
npx cap open android      # from apps/web
# Android Studio → Build → Generate Signed App Bundle → create an upload key
```

Keep the keystore file and its two passwords somewhere you cannot lose them: losing them means
asking Google support to reset the key.

## 2. App access (Play refuses a review it cannot sign in to)

Play Console → _App content → App access → All or some functionality is restricted_. Give the
reviewer these, from `docs/DEMO.md`:

| What to show      | Email            | Password |
| ----------------- | ---------------- | -------- |
| A guardian        | `parent1@t.test` | `123456` |
| A driver on a run | `driver2@t.test` | `123456` |
| A school's admin  | `school@t.test`  | `123456` |

Instructions to paste in the box:

> The app is used by guardians, bus drivers and schools. Sign in with any of the accounts above —
> no code is sent, they are ready. The guardian account shows two children and today's trips. The
> driver account has a trip in progress: press "end trip" to see the app refuse while a child is
> still on board. The school account shows the fleet and the open alert.

These accounts must exist on the server when the reviewer tries. Actions → "Demo data" rebuilds
them.

## 3. Data safety

_App content → Data safety_. What the app really collects:

| Data                         | Collected | Shared | Why                                                          | Optional |
| ---------------------------- | --------- | ------ | ------------------------------------------------------------ | -------- |
| Name (guardian, driver)      | Yes       | No     | App functionality, account management                        | No       |
| Email address                | Yes       | No     | Account management (sign-in, verification code)              | No       |
| Phone number                 | Yes       | No     | App functionality — a guardian may be called in an emergency | No       |
| Name of a child              | Yes       | No     | App functionality — the driver must see who is on the bus    | No       |
| Photo of a child             | Yes       | No     | App functionality — the driver recognises the right child    | No       |
| Approximate/precise location | Yes       | No     | App functionality — one position **at the moment of a tap**  | No       |
| Crash logs / diagnostics     | No        | —      | Sentry is off unless the operator turns it on                | —        |
| Advertising / analytics      | No        | —      | There are none                                               | —        |

Also tick:

- **Encrypted in transit** — yes (HTTPS everywhere, HSTS).
- **Users can request that data be deleted** — yes: `https://tammene.com/delete-account`.
- **Committed to Play Families Policy** — no, the app is not directed at children.

**Location must be described exactly as it works**, or the review fails: the app takes one
position when the driver taps a child on or off, while the app is open. There is **no background
location** — the manifest does not ask for `ACCESS_BACKGROUND_LOCATION`, so no location
declaration form is required.

## 4. The other App content forms

| Form                 | Answer                                                                             |
| -------------------- | ---------------------------------------------------------------------------------- |
| Privacy policy       | `https://tammene.com/privacy`                                                      |
| Target audience      | **18 and over.** Used by guardians, drivers and school staff — never by a child    |
| Appeals to children? | No                                                                                 |
| Ads                  | None                                                                               |
| Content rating       | Answer the questionnaire honestly: no violence, no user-generated content, no chat |
| News app             | No                                                                                 |
| Data deletion        | `https://tammene.com/delete-account`                                               |
| Government app       | No                                                                                 |
| Financial features   | None                                                                               |
| Health features      | None                                                                               |

## 5. Permissions, and what to answer if asked

| Permission                                        | Why                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `INTERNET`                                        | Talking to the server                                                                                              |
| `POST_NOTIFICATIONS`                              | Safety alerts — the point of the app                                                                               |
| `SCHEDULE_EXACT_ALARM`                            | The driver's reminder while children are on board. **Not** `USE_EXACT_ALARM`, which Play reserves for alarm clocks |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `VIBRATE`  | The local alarm has to work with a locked phone and no internet                                                    |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | One position per tap, foreground only                                                                              |
| `CAMERA`                                          | The guardian takes the child's photo. No access to the photo library                                               |

## 6. Store listing

- **App name:** طمّني — Tammeni
- **Short description (80):** «ضغطة عند صعود طفلك، وضغطة عند نزوله — وطمأنينة بينهما.»
- **Full description:** say what it does in plain words: a tap per child, the trip cannot end
  while a child is on board, the school and the guardian are told, and the watchdog works even if
  the driver forgets. **Do not promise that no child will ever be harmed** — it contradicts clause
  3 of the terms and Play removes apps for overstated claims.
- **Graphics:** icon 512×512, feature graphic 1024×500, at least two phone screenshots. Use the
  demo accounts for the screenshots so no real child appears.
- **Category:** Education, or Parenting.
- **Contact:** `support@tammene.com` — an address that is actually read.

## 7. Release track

Upload to **Internal testing** first and install it on real phones (docs/RELEASE.md §4). A new
**personal** developer account must then run a **closed test with 12 testers for 14 continuous
days** before Play grants production access; an organisation account does not. Check the current
requirement in the console — Google changes it.

## 8. The honest gaps, before a real school uses this

- The legal documents have not been read by a lawyer.
- iPhone is not built (needs a Mac and an Apple account).
- The test accounts share the password `123456` and must be deleted before the first real school.
