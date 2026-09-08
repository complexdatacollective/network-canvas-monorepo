---
'fresco': patch
---

Refuse, with a 403, any request that names a Server Action — whether through a `Next-Action` header or, for a plain HTML form submitted without JavaScript, a `multipart/form-data` body — unless it targets `/signin`, `/setup`, `/expired`, or `/dashboard`, the only pages that bind one. Next dispatches a Server Action independent of the URL a request is sent to, and independent of whether that URL matches any route at all, so this holds for every other path regardless of what a reverse proxy in front of Fresco does — a participant route, the site root, or an address nobody defined cannot be used to invoke a researcher-only Server Action (participant data export, deletion, and settings changes among them).
