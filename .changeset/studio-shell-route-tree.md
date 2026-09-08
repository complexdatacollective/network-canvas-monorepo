---
'@codaco/studio-client': minor
---

Give Studio's routes the four shells the application shell design specifies, and stop asking the auth endpoint on every navigation. The route tree gains site, focused, participant and app layout branches below the root, so a route's chrome follows from where it sits: sign-in and invitation acceptance move to the focused branch, and the authenticated tree moves to the app branch. The session is now one query with `staleTime: Infinity`, which guards read with `fetchQuery`, so entering the authenticated tree a dozen times costs one request rather than a dozen. A procedure refusing with 401 invalidates that query and re-runs the guards, so an expired session is noticed without waiting for the next navigation. The 503 no-database answer still means signed out, and an unreachable server still reaches the error screen instead of the sign-in page.
