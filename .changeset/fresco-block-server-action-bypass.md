---
'fresco': patch
---

Refuse, with a 403, any request whose `Next-Action` header targets a participant or infrastructure route. Next.js dispatches a Server Action by that header, independent of the URL a request is sent to, and this holds regardless of what a reverse proxy in front of Fresco does — a route left public for participants, such as `/interview/finished`, cannot be used to invoke a researcher-only Server Action (participant data export, deletion, and settings changes among them).
