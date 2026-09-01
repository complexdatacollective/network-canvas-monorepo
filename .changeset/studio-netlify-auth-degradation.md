---
'@codaco/studio-server': patch
---

Fix the Netlify deployment answering every request with the client's "server could not be reached" screen. The lane is documented to run with no database and auth off, because a deploy preview's per-PR origin can never match PUBLIC_URL — but that rested on the Netlify site not defining DATABASE_URL, which nothing enforced. With a database configured but unusable from the function, better-auth failed the session lookup with a 500 and the CSRF gate refused the preview's own requests. The Netlify entrypoint now drops both surfaces itself, so the documented degradation is what runs: sign-in reports that it is unavailable on this server instead of the app replacing itself with an error screen.
