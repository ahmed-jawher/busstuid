# Releasing the Android and iOS apps (PLAN §17 phase 6)

The apps are the same web app inside Capacitor (`apps/web/android`, `apps/web/ios`), with the
native implementations in `apps/web/src/platform/native`. Everything that could be done without
accounts is done and tested:

- native device ports: push, scheduled reminders, Keychain/Keystore, location, camera, haptics,
  keep-awake, app lifecycle (`src/platform/native/native.test.ts`);
- server push through **FCM** (Android) and **APNs** (iOS), tested against a fake sender,
  including signatures, token caching and dead-token cleanup (`apps/api/src/push/native.test.ts`);
- CI builds an Android **debug APK** on every pull request (job `android`, artifact
  `wusool-safe-debug-apk`). It has no Firebase file, so push does not work in it; everything
  else does, against the API address it was built with.

What remains needs the owner's accounts, a Mac for iOS, and real phones.

## 0. Before anything

- The app id is `com.wusoolsafe.app` (`apps/web/capacitor.config.ts`, iOS bundle id,
  `APNS_BUNDLE_ID`). **Change it now if you want another one** — it cannot change after the
  first store upload. Change it in all three places, then run `npx cap sync`.
- The production API must be live over HTTPS (docs/DEPLOY.md). Native builds require its
  absolute address:

```bash
VITE_API_URL=https://app.example.com/v1 pnpm --filter @wusool/web native:sync
```

- Replace the default Capacitor icons and splash screens (`android/app/src/main/res/mipmap-*`,
  `ios/App/App/Assets.xcassets`), e.g. with `npx @capacitor/assets generate` from a 1024 px logo.

## 1. Accounts (owner)

| Account                                    | Cost         | Needed for                       |
| ------------------------------------------ | ------------ | -------------------------------- |
| Firebase project (console.firebase.google) | free         | Android push (FCM)               |
| Google Play Console                        | one-time fee | publishing the Android app       |
| Apple Developer Program                    | yearly fee   | iOS push (APNs) and App Store    |
| A Mac with Xcode                           | —            | building and signing the iOS app |

## 2. Android

1. **Firebase:** create a project → _Add app_ → Android → package `com.wusoolsafe.app`.
   Download `google-services.json` into `apps/web/android/app/`. It is **never committed** (the
   secret scan refuses it); keep a copy in your password manager.
2. **Server key:** Firebase → Project settings → Service accounts → _Generate new private key_.
   Put the file base64-encoded on one line into `.env.production` and restart the API:
   ```bash
   base64 -w0 service-account.json   # → FCM_SERVICE_ACCOUNT_BASE64=...
   ```
   Until this is set, the server refuses Android devices with `push_provider_unavailable`
   instead of silently not delivering.
3. **Build:** install Android Studio, then `npx cap open android` from `apps/web` →
   _Build → Generate Signed App Bundle_. Create an **upload key** and store it and its
   passwords safely (losing it means contacting Google support to reset it).
4. **Play Console:** create the app, upload to _Internal testing_ first. Fill in the _Data safety_
   form: children's names and photos, guardian contact details, one location per tap (not
   tracking), all encrypted in transit, deletion available in the app. The app is for guardians,
   drivers and schools — it is not directed at children.
5. **Phones:** on Android 14 and later, reminders arrive on time only if the user allows
   _Alarms & reminders_ for the app (Settings → Apps → وصول آمن). Without it they can be a few
   minutes late; alerts sent by the server (push) are not affected. Some manufacturers (Xiaomi,
   Huawei, Oppo…) also stop background apps — tell drivers to set battery use to _Unrestricted_.

## 3. iOS (needs a Mac)

1. **APNs key:** Apple Developer → Certificates, IDs & Profiles → Keys → _+_ → enable
   _Apple Push Notifications service_. Download the `.p8` file (only once!), note its **Key ID**
   and your **Team ID**. In `.env.production`:
   ```bash
   APNS_KEY_BASE64=$(base64 -w0 AuthKey_XXXXXXXXXX.p8)
   APNS_KEY_ID=XXXXXXXXXX
   APNS_TEAM_ID=YYYYYYYYYY
   APNS_ENV=production   # TestFlight and App Store; "sandbox" for builds run from Xcode
   ```
2. **Identifier:** register the App ID `com.wusoolsafe.app` with the _Push Notifications_ and
   _Time Sensitive Notifications_ capabilities (already declared in `App/App.entitlements`).
3. **Build:** on the Mac, `pnpm install`, the `native:sync` command above, then
   `npx cap open ios` → select your team under _Signing & Capabilities_ → _Product → Archive_ →
   upload to **TestFlight**.
4. **Optional — Critical Alerts:** sound even in silent mode needs a special entitlement Apple
   grants on request (developer.apple.com/contact/request/notifications-critical-alerts-entitlement).
   Until then, safety alerts are _time-sensitive_: they break through Focus modes but respect the
   silent switch. Explain the use (children possibly left on a vehicle) when applying.
5. **App Store Connect:** privacy "nutrition label" with the same data as the Play form.

## 4. Check on real phones before any school uses it

For each platform, with the phone locked and the app closed:

1. Sign in → notification setup → the test notification arrives.
2. As a driver, start a trip, board a child, lock the phone: the guardian's phone rings.
3. End the trip with a child still on board (forced): driver, guardian and admin all get the
   critical alert; tapping it opens the alert screen.
4. Leave a trip running past its planned end: the overdue alert arrives (server watchdog).
5. Turn on airplane mode, tap children, turn it off: the taps sync and guardians are notified.

Only after this works on both platforms should the "trial version" banner at the top of every screen
be removed (PLAN §20.4).
