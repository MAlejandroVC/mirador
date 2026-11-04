# 0004. Passkeys, Face ID unlock and auto-lock

- Status: accepted
- Date: 2026-10-13
- Issue: #229, #248

## Context

People sign in with a password, and passkeys are an option (SYS-06). The data is encrypted with a key that only the password (or the recovery key) can open (SEC-02, SEC-07), so a passkey that only signs in would still leave the person typing their password to see anything. On a phone they want Face ID to open the app. The app must also lock after a time the person picks, dropping the key from memory (SEC-12).

## Decision

- **A passkey opens the data, not only the account.** Each passkey must support the WebAuthn PRF extension: asked with a fixed input (`passkeyPrfInput` in `@repo/api`), it returns 32 secret bytes only that passkey can produce, after Face ID, a fingerprint or the device's PIN. HKDF turns them into an AES-KW key that wraps the account key (`derivePasskeyKey` in `@repo/crypto`), and the server stores that wrapped key next to the passkey's public key. The PRF secret never leaves the browser: the page hands it to the worker and sends `clientExtensionResults: {}`, and the server's schema refuses anything else.
- **No PRF, no passkey.** A passkey that can't give a PRF secret is refused before it is saved, with a message saying which kinds work, and the browser is asked to forget it where it can (`signalUnknownCredential`). iCloud Keychain (iOS 18 and later) and Google Password Manager support PRF.
- **Adding a passkey needs the current password,** like changing it (SEC-08). The worker checks the password against the wrapped key before the device makes the passkey, so a typo doesn't leave a passkey on the device that the account never saved, and the server checks the login secret again. Removing a passkey needs only a session.
- **The server checks every passkey with `@simplewebauthn/server`,** wrapped in `apps/server/src/auth/webauthn.ts`, the only file allowed to import it. User verification and discoverable credentials are required. The site (relying party) is the page's own origin, so each server, preview included, has its own passkeys and nothing needs configuring. Challenges live in memory for five minutes and work once. A signature counter that goes backwards is refused.
- **Sign-in and unlock are one ceremony.** Signed out, any of this site's passkeys may answer and the server signs that user in. Signed in with the data locked, the server offers only that user's passkeys and refuses any other. Either way it returns the passkey's wrapped account key and starts a fresh session.
- **Auto-lock is a choice per device,** kept in this browser's storage under `mirador.autoLock`: as soon as the app leaves the screen, or after 1, 5 (the default), 15 or 60 minutes without a tap, a key press or a scroll. There is no "never". Time away from the app counts, and is checked the moment it comes back, since timers barely run in the background. Locking drops the key and every query but the session, and opens the unlock screen.

## Consequences

- With a passkey, the data is as safe as the device's lock and the passkey provider's account (an Apple or Google account for synced passkeys). That is the person's choice, and the password and recovery key keep working.
- **Changing the password keeps passkeys; recovering with the recovery key removes them all.** Passkeys wrap the same account key, so they still open it after a password change, and the security screen lists every passkey with when it was added and last used, so any can be removed. Recovery often means someone else had the password, and a passkey they added with it would still let them in, so recovery removes every passkey and the person adds Face ID again.
- Browsers without PRF (Firefox on some systems, older iOS) can't add passkeys; the security screen says so and the password works as before.
- The server can see how many passkeys a user has and when each was used.
- SEC-12 says the password unlocks again; a passkey now can too. The spec should say so.
