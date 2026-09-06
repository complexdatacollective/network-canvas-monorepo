---
'@codaco/studio-sync': minor
'@codaco/studio-server': patch
---

Use one bounded SMTP sender for sign-in and invitation email. SMTP URLs accept connection credentials and an authority, with TLS required outside local development; URL options cannot enable message logging or override timeouts. Invitation delivery records an uncertain outcome when SMTP acceptance cannot be confirmed, preventing an automatic duplicate send.
