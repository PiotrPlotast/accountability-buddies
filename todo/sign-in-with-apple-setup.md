# Sign in with Apple — one-time setup

> **Done 2026-09-14.** Every section below was carried out against
> `com.piotrplotast.accountabilitybuddies` and sign-in was verified end to end
> on a physical device — the sheet opens, Apple returns an identity token and
> Supabase accepts it. No step deviated from what is written here, so none of
> the symptoms in "What a wrong value looks like" came up.
>
> Kept as the record of what was configured, and as the recipe if any of it
> ever has to be walked again — a new App ID, a rotated key, or a second
> environment. **Nothing here is outstanding.**

The app code for E2 PR 2 is done and tested. None of it works until the two
things below are configured, because the identity token Apple returns is
rejected by Supabase unless Supabase already knows which app issued it.

Order matters: Apple first, Supabase second, prebuild last.

## 1. Apple Developer portal

**Capability on the App ID.** Certificates, Identifiers & Profiles →
Identifiers → `com.piotrplotast.accountabilitybuddies` → tick **Sign in with
Apple** → Save. The `expo-apple-authentication` config plugin writes the
matching `com.apple.developer.applesignin` entitlement into the generated
project, but the entitlement is only honoured if the App ID grants it.

**Services ID.** Identifiers → **+** → Services IDs. Give it a description and
an identifier — convention is the bundle ID with a suffix, e.g.
`com.piotrplotast.accountabilitybuddies.signin`. Enable Sign in with Apple on
it, Configure, and set:

- Primary App ID: `com.piotrplotast.accountabilitybuddies`
- Return URL: `https://rlvhncdzrfwjpohiqqfv.supabase.co/auth/v1/callback`

The Services ID and the return URL only matter for the *web* flow. The native
sheet this app uses doesn't redirect anywhere — but Supabase's Apple provider
form asks for the Services ID as its "Client ID", so it has to exist.

**Sign in with Apple key.** Keys → **+** → tick Sign in with Apple → Configure
→ pick the primary App ID → Register → **Download the `.p8` once**. It cannot
be downloaded again. Note the **Key ID** (10 chars) and your **Team ID** (top
right of the portal, also 10 chars).

> This is a *different* key from the APNs key created 2026-09-03 for push. A
> Sign in with Apple key cannot be used for APNs and vice versa. Don't reuse it.

## 2. Supabase dashboard

Authentication → Sign In / Providers → **Apple** → enable, then:

| Field | Value |
| --- | --- |
| Client IDs | `com.piotrplotast.accountabilitybuddies` |
| Secret Key (for OAuth) | *blank* — see below |
| Key ID | *blank* |
| Team ID | *blank* |

**The bundle ID in "Client IDs" is the whole requirement.** The native flow
sends a token whose `aud` claim is the *bundle* ID, not the Services ID. If
only the Services ID is listed, every native sign-in fails.

**The `.p8` secret is not needed for the native flow.** It exists so Supabase
can call Apple's token endpoint during the *web* OAuth redirect. This app never
redirects — it hands Supabase a token Apple already signed, and Supabase only
verifies the signature and checks `aud` against Client IDs. Add the Services ID
and the key only if a web or Android flow is ever added.

Check the switch without rebuilding — the endpoint is public and needs only the
publishable key:

```bash
set -a && . ./.env && set +a
curl -s "$EXPO_PUBLIC_SUPABASE_URL/auth/v1/settings" -H "apikey: $EXPO_PUBLIC_SUPABASE_KEY" | python3 -m json.tool
```

`external.apple` is `false` until the provider is on. Nothing needs a new build
when it flips — the check happens server-side on every sign-in attempt.

## 3. Local build

```bash
npx expo prebuild --clean     # regenerates ios/ with the entitlement
npm run ios                   # rebuild the dev client
```

`ios/` is gitignored generated output, so the entitlement does not exist until
this runs. The simulator or device also has to be signed into an Apple ID —
Settings -> Sign in to your iPhone — or the sheet fails with
`AKAuthenticationError -7026` exactly as if the entitlement were missing.

**A development certificate is required even for the simulator.** `@expo/cli`
keeps a list of entitlements that force code signing on simulator builds
(`run/ios/codeSigning/simulatorCodeSigning.js`), and
`com.apple.developer.applesignin` is on it. With no identity in the keychain,
`expo run:ios` fails with "No code signing certificates are available to use"
before `xcodebuild` starts. Fix it once in Xcode -> Settings -> Accounts; use
the account that owns the APNs key, since Sign in with Apple needs the paid
membership anyway.

### Expo Go — does not work, build only

The sign-in screen in Expo Go shows a grey "Unimplemented component:
ViewManagerAdapter_ExpoAppleAuthentication" box where the button should be.
That is not a misconfiguration: `expo-apple-authentication` is not in the Expo
Go binary, so the native view its JS asks for does not exist.

Verified against Expo Go 57.0.9 rather than taken from the docs, whose badge
claims "Included in Expo Go":

```
strings <Expo Go binary> | grep -c ExpoAppleAuthentication   # 0
strings <Expo Go binary> | grep -c ExpoImage                 # 180  (control)
strings <Expo Go binary> | grep -c ExpoCrypto                # 38   (control)
```

`expo-crypto` *is* there, so the nonce half of the flow would run — but the
sheet cannot open, so nothing reaches Supabase. Test Sign in with Apple in a
development build only.

## What a wrong value looks like

| Symptom | Cause |
| --- | --- |
| Sheet doesn't open; the button does nothing | Entitlement missing — the App ID capability or the prebuild |
| `Unacceptable audience in id_token` | Bundle ID not in Supabase's Client IDs |
| `invalid nonce` | Not a credentials problem. The raw and hashed nonce are swapped — pinned against this by `__tests__/lib/appleNonce.test.ts` |
| `Provider issuer appleid.apple.com is not enabled` | Apple provider still off in Supabase. The sheet opening and returning a token first means sections 1 and 3 are already right |

## Known hole, accepted

The same person can end up with two accounts: sign up with email, later tap
Continue with Apple and choose **Hide My Email**, and Supabase sees a different
address and makes a second account — new id, empty profile, no group, a
stranger to their own crew. Nothing in the app can fix that. With two test
users it is theoretical; revisit when there are real users. See the E2 section
of `todo/roadmap.md`.
