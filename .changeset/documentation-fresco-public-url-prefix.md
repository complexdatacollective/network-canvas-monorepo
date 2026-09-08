---
'@codaco/documentation': minor
---

Rewrote the FAQ for IT departments' guidance on restricting Fresco's researcher surfaces to an institutional network: Fresco now keeps every participant-facing URL under four prefixes (`/interview/`, `/onboard/`, `/api/public/`, `/_next/`), so the proxy rule is an allow list of those with everything else restricted. Added a "Restricting the researcher surfaces to your network" section to the Advanced Deployment guide with worked Traefik and nginx examples, and updated the UploadThing callback path to `/api/public/uploadthing` wherever it is named.
