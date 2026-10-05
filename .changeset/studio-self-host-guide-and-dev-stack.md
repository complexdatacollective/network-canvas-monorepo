---
'@codaco/studio-server': minor
---

Studio can now be self-hosted from documentation alone. A guide under
`apps/studio/docs/self-host/` takes an institution from two downloaded files —
the compose file and the environment example — to a signed-in owner account,
without a repository checkout and without pnpm, Node or drizzle-kit on the
host. It covers the requirements a host must meet, backups and restore, the
upgrade sequence, swapping the database, object store, rate-limit store or
ingress for the institution's own, and moving between Postgres majors. A
requirements page states the host sizing, the Docker versions, the ports and
DNS, the complete list of outbound hosts, and the contract each swapped-in
service has to meet; the outbound hosts are also a checked-in list, and a test
refuses to let the two disagree. `apps/studio/docs/topology.md` draws the stack
and its routing table.

`pnpm --filter @codaco/studio-server dev:stack` runs that same stack on this
machine: it builds both images from the checkout, brings up the complete
compose file on `https://localhost` behind Traefik, runs the `migrate` one-shot
and hands back its first-run setup token. It exists so the routing table, the
maintenance page, the first-run screen and an upgrade can be exercised before
any of them reach someone else's host. `dev:stack:down` stops it, and
`-- --volumes` wipes its data back to a fresh first run. It runs alongside
`pnpm dev` rather than instead of it — a separate Compose project, subnet and
set of ports.
