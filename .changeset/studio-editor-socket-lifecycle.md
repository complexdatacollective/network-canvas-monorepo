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
Signing out now ends the tab's editor session rather than only closing the
socket, because the link reconnects on its own schedule: a reconnection already
scheduled when the researcher signed out would otherwise open a replacement
while their session was still valid, and nothing was left to close it.
