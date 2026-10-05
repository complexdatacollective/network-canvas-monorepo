---
'@codaco/studio-client': minor
---

Give Studio every destination the application shell design specifies, so the
product's shape is something a researcher can see and address rather than
something only the design document knows about. The route tree gains the
marketing, sign-up, first-run, no-team and participant screens on the branches
that own their chrome, and the whole of the platform, team and study levels
below the app shell: the account area, the gallery and template libraries, team
administration, and the study — overview, participants, waves, sessions,
schedule, recruitment, versions, export and settings, with the protocol editor
as a sibling area whose outline replaces the study sidebar rather than nesting
inside it.

Each unbuilt screen names itself, says in a sentence what it will do, and names
the issue that builds it. That is a different thing from a broken link, and a
different thing again from a navigation edited down to whatever happens to work
today: hiding an unbuilt destination misdescribes the product, and linking to
nothing misleads about it.

The navigation is complete for the first time. The header carries the wordmark,
the team the researcher is acting in, the study they are acting in when they
are inside one, the gallery and template libraries, and their account. The team,
study, account and protocol-outline sidebars carry every destination their area
has. The one row that is not a link is billing on a self-hosted instance, which
is a destination that deployment genuinely does not have: it is shown, and it
explains itself, rather than being quietly dropped from the list.

`$studyId` addresses a protocol until the studies model lands (#1262), and `/`
is still the team workspace rather than the marketing home until that workspace
splits into the team area.
