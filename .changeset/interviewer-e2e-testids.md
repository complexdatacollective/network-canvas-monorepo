---
'@codaco/interviewer': patch
---

End-to-end test suite and the fixes it surfaced:

- Settings → Synthetic data now re-queries protocols when the tab is selected, so a protocol imported moments before Settings was opened becomes selectable without closing and reopening the dialog.
- The Security tab no longer shows the step-up "require unlock" toggles and auto-lock timeout before a vault is configured — those controls were inert (and discarded on enrolment) without a secured, unlocked vault.
- The authenticator/device-reset UI now treats an unconfigured device the same as an explicitly unsecured one: it reads "Device lock" / "Reset device" rather than "Authenticator" / "Revoke device lock" when there is no lock to revoke.
- Added `data-testid` hooks to app chrome (protocol deck import, DataView toolbar/resume, settings trigger, synthetic controls, new-session form, interview-complete, lock/unlock forms, ambient background) to support the new end-to-end suite.
