---
'@codaco/studio-client': minor
---

Studio's masthead becomes the application shell. Every authenticated screen sat
under a wordmark and a sign-out button, and each route declared its own
`<main id="main-content">` — three of them in the editor alone, so which element
the skip link reached depended on which branch had rendered.

The app branch now renders the shared `AppFrame`: one skip link, one header, and
a region that each area layout renders its navigation region and its `<main>`
into. The header carries a team switcher over the teams the researcher belongs
to, and an account menu holding sign out, whose sequence is unchanged. The team
workspace and the activity screen sit under a team area layout with a sidebar,
and the Activity destination moves into it from the workspace's own header, so
it is offered in one place rather than two. The editor sits under an area of its
own, which owns the landmark its three branches used to declare separately.

The shell also stops subscribing to the session. `AppLayout` called
`authClient.useSession()`, which fetched `/api/auth/get-session` a second time on
every page load on top of the request the route guard had already made and
cached. The guard is now the only reader, and it is also where a session that has
ended clears the researcher's cached data and leaves for the sign-in page — past
a dirty-form blocker, because there is no editor state left worth keeping.
