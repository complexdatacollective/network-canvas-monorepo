---
'fresco': minor
---

Passkeys now have to verify who you are. Fresco asks every passkey to confirm your identity with a PIN, fingerprint, or face when it is registered and each time you sign in, and refuses a response in which the authenticator skipped that check. A passkey sign-in therefore always proves both that you hold the device and that you are its user, which is the assurance the Accounts & Security documentation describes.

Previously Fresco requested this verification but accepted responses without it, so a hardware security key with no PIN could sign in on possession of the key alone.

A passkey registered on a security key that cannot verify you no longer signs in, and Fresco tells you what to check rather than reporting a generic failure or, when the browser closes the passkey prompt on its own, saying nothing at all. Sign in with another of your passkeys, or ask another administrator to use **Reset Auth** on your account. If you are already signed in, add a passkey that verifies you from **Settings → User Management** before you sign out. Registering a new passkey on such a key is refused with the same explanation.
