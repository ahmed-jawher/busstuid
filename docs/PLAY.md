# Google Play submission — the answers, ready

Everything Play asks for, answered against what the code actually does. Go through it in order;
the parts marked **(owner)** cannot be done from the repository.

## 0. Before the first upload — the three that cannot be undone

| Decision       | Now                                           | Can it change later?                                  |
| -------------- | --------------------------------------------- | ----------------------------------------------------- |
| App id         | `com.tammene.app`                             | **Never**, once uploaded                              |
| API address    | baked into the Android build (`VITE_API_URL`) | Only with a new release                               |
| Account holder | personal or a registered entity **(owner)**   | Transfer is possible but slow, and the name is public |

The app id already matches the brand. Build against the **domain**, never the raw IP.

## 1. Build the file Play accepts

CI builds a **debug APK** on every pull request — that is for testing on a phone, not for Play.
Play needs a **signed AAB**.

**Once:** create the upload key and keep it where it cannot be lost. Losing it means asking Google
support to reset the key.

```bash
keytool -genkeypair -v -keystore tammene-upload.jks -alias tammene \
        -keyalg RSA -keysize 2048 -validity 10000
```

Copy `apps/web/android/keystore.properties.example` to `keystore.properties` beside it and fill in
the path and the two passwords. That file is git-ignored and never leaves your machine; without it
the release build is simply unsigned, so CI carries on working.

**Every release:**

```bash
VITE_API_URL=https://tammene.com/v1 pnpm --filter @wusool/web native:sync
cd apps/web/android && ./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

Android Studio does the same through _Build → Generate Signed App Bundle_, and creates the key for
you in a dialog if you would rather click than type. Either way it needs **JDK 21** (Android
Studio's own Java 25 is too new for this Gradle).

### The pictures

`pnpm --filter @wusool/web store:graphics` writes them into `apps/web/store/`, drawn from the same
mark the app draws: the 512 icon and the 1024×500 feature graphic Play asks for, and the 1024 icon
for Apple. Screenshots must come from the running app, signed in as a test account
(`docs/DEMO.md`) — never a real child.

## 2. Sign in details (Play refuses a review it cannot sign in to)

Play Console → _App content → Sign in details_ (it used to be called App access) → **Yes, part of
my app is restricted**. Add **four** sets, one per role, so the box at the bottom — "these details
provide full access to all the features in this app" — is true. All of them use the password
`123456`, and none of them is ever asked for an email code.

| Name (in the form)          | Username         |
| --------------------------- | ---------------- |
| `Guardian (parent) account` | `parent1@t.test` |
| `Bus driver account`        | `driver2@t.test` |
| `School admin account`      | `school@t.test`  |
| `Platform operator account` | `admin@t.test`   |

The instructions must be in English, and must not depend on the day the reviewer happens to open
the app:

> **Guardian** — Already verified: no email code is needed. Shows three children, their trips for
> today and the notification history. The interface is Arabic by default; for English open the
> Account tab and choose Language.
>
> **Driver** — This driver has today's trips on the home screen. Open the trip that is running (or
> press "Start trip" on a scheduled one), tap a child as boarded, then press "End trip": the app
> refuses while a child is still recorded on board, names that child in red and sounds an alarm.
> This is the app's core safety feature. If asked, please allow notifications — a driver cannot
> start a trip on a device that cannot receive alerts.
>
> **School admin** — Buses, routes with stops, enrolled students, an enrolment request waiting for
> approval, and open critical alerts that can be closed with a documented reason.
>
> **Platform operator** — Approves new schools and kindergartens before they appear in the
> directory parents choose from. One kindergarten is waiting for approval.

### The data has to be fresh on a day nobody can predict

A trip that is "in progress" stops being in progress within the hour, and a review arrives when it
arrives. Two things keep the accounts worth signing in to:

- The **"Demo data refresh"** workflow rebuilds everything every morning, and fails loudly if a
  test account cannot sign in afterwards. It only runs while the repository variable `DEMO_SERVER`
  is `true` — **clear that variable the moment a real school's data is on the server.**
- The demo routes run **seven days a week**, which a real school does not, so a reviewer who opens
  the app on a Friday still has a trip to look at.

Write the instructions so the reviewer can **start a trip themselves**; never "there is a trip in
progress", which is only true for an hour.

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

- **App name:** طمّني — Tammene
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
