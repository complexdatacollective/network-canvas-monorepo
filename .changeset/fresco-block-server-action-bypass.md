---
'fresco': patch
---

Refuse, with a 403, any request that targets a participant or infrastructure route while naming a Server Action — whether through a `Next-Action` header or, for a plain HTML form submitted without JavaScript, a `multipart/form-data` body. Next dispatches a Server Action independent of the URL a request is sent to, and this holds regardless of what a reverse proxy in front of Fresco does — a route left public for participants, such as `/interview/finished`, cannot be used to invoke a researcher-only Server Action (participant data export, deletion, and settings changes among them).
