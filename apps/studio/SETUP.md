# Self-hosted first-run setup

Apply the image's [versioned migrations](MIGRATIONS.md) to an empty database,
configure its database, object storage, encryption keys, authentication secret,
and public HTTPS URL, then start the server in `self-hosted` mode. Migration
and first-run setup are separate operations; starting the server does not
apply migrations.

Generate a new random 32-byte setup token with Node's cryptographic generator:

```sh
node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))'
```

Store the result as `STUDIO_BOOTSTRAP_TOKEN` in the deployment's secret
configuration. This is a 43-character, unpadded base64url value. Use a newly
generated value rather than a memorable password or a copied example. Give
the token only to the person claiming the first owner account; keep it out of
URLs, issue comments and logs.

Visit the instance's origin URL. A ready, empty installation redirects to
`/setup`. Enter the instance name, the first owner's name, email and password,
and the setup token. The password must contain 12–128 characters. Setup
creates that owner, a team using the instance name, its Owner membership, the
permanent instance record and a team-creation audit event in one transaction.
Sign in with the new owner's email and password when it completes.

The deployment operator's token authorizes that initial identity and verifies
its email for Studio. The token is usable once: concurrent attempts have one
winner, and later attempts are refused across server restarts. Removing the
original owner or team does not reopen setup. Remove `STUDIO_BOOTSTRAP_TOKEN`
from the deployment configuration after completion and restart normally.

An error before commit leaves setup available with the same token. If the
response was lost after commit, a retry recognizes that setup is already
complete. Database errors are surfaced as a failed operation rather than a
partially created account. A populated database without the permanent setup
record cannot be claimed through this flow; do not erase its existing users
or stamp a completion record by hand to bypass that refusal.

Self-hosted account creation requires a pending, unexpired team invitation
and a verified email received through a magic-link or OAuth sign-in. The
email/password registration endpoint is disabled, including for invited
addresses. Existing accounts can still sign in with their password. Accepting
an invitation remains a separate, audited action that checks its current
status and the signed-in email. OAuth linking to an existing self-hosted
account also requires a provider-verified email claim. A provider that omits
that evidence cannot enroll or link that identity; use a magic link instead.
Microsoft accounts may provide `email_verified` or an exact mailbox match in
`verified_primary_email`/`verified_secondary_email`. An ordinary mutable email
claim or email-domain ownership alone does not establish mailbox ownership;
signing in locally does not override that provider linking requirement.

Managed deployments do not expose `/setup` or its setup RPCs and retain
their managed enrollment behavior.

## Development fixtures

Committed development defaults use `managed` mode and the existing synthetic
seed account. Switching a seeded development database to `self-hosted` mode
does not claim it or create another owner: `/setup` explains that first-run
setup is unavailable, and `/` continues to the existing sign-in/landing flow.
To exercise a real first run, use a separate empty local database, apply the
versioned migrations and supply a fresh setup token. Do not seed it first.

The normal development reset remains destructive and local. An empty instance
table permits the seed's cascading truncation; a completed installation
refuses deletion or truncation of its completion record. Recreating an entire
development database is a deliberate reset, not a way to reopen production
setup.
