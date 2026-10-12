---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Dialogs no longer close as if nothing happened while the work they started
carries on. Before, cancelling or dismissing one of these dialogs mid-way told
you the action had been called off, but it still completed behind the dialog,
and the page could then update as though it had not.

While the work runs, Cancel is disabled, the close button is hidden, and
Escape and clicks outside the dialog are ignored. If the work fails, the
dialog shows why and can be left or retried.

- **Architect:** deleting an entity type or a variable from the codebook.
- **Fresco:** removing a passkey; deleting, adding and resetting the
  authentication of users; changing your password; switching between password
  and passkey sign-in; turning off two-factor authentication and regenerating
  recovery codes; setting up two-factor authentication; deleting interviews,
  participants, protocols and API tokens; creating an API token; adding or
  editing a participant; resetting the app; and saving an UploadThing token.
  A refused two-factor code or action now shows its reason on the form.
- **Interviewer:** revoking the device lock or resetting the device; deleting
  synthetic sessions; unlocking with the recovery passphrase; and setting up
  a PIN, passphrase or biometric unlock in the setup wizard.
- **Interviews:** the finish confirmation cannot be cancelled once the
  interview has started finishing, because the finish completes regardless.
  The exit confirmation can still be cancelled while it waits.
