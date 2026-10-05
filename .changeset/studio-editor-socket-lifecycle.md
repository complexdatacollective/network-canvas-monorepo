---
'@codaco/studio-client': patch
---

Keep the protocol editor working across a dropped connection, and close its
socket when the researcher signs out. The editor's WebSocket link never
reconnected, so a single transient drop left every lock, save and live update
going to a closed connection until the page was reloaded — and the server's
grace period, which keeps the screen a researcher is editing theirs across a
reconnect, could not be reached at all. The socket also outlived sign-out,
which matters because the server reads the account once, when the socket is
opened, and attributes every later message to it: signing in as somebody else
in the same tab would have edited and been audited as the previous researcher.
Ending a session now ends the tab's connection to the editor rather than only
closing its socket, because the link reconnects on its own schedule: a
reconnection already scheduled when the researcher signed out would otherwise
open a replacement while their session was still valid, and a request left
waiting for one would have travelled on the next account's socket. Every way
out of a session does it, because it happens wherever the app learns that
nobody is signed in — signing out, switching accounts from an invitation, and
a session that expires or is ended in another tab, on a public page as much as
inside the app.
