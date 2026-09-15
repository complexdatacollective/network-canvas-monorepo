---
'@codaco/studio-server': minor
'@codaco/studio-client': minor
'@codaco/studio-rpc': minor
---

A freshly installed Studio instance can now be set up by the person who
installed it. Until now a new deployment had no account to sign in with and no
way to create one: `/setup` was a placeholder, and the only account any
instance had came from the development seed.

The command that creates the database now issues a **bootstrap token** and
prints it once, in the output the operator is already reading, with the address
to spend it at. `/setup` takes that token, the name this instance should be
known by, and the first owner's account — and signs them in as it completes, so
setting an instance up ends on their own screen rather than back at a sign-in
form. Only a hash of the token is stored, so a lost one is recovered by running
the database command again: an instance nobody owns issues a fresh token, and
an instance somebody owns issues none and prints nothing. Once there is an
owner, `/setup` is gone — it answers as a page that is not there, on every
later deploy — so a repeated deploy command can never reopen the door to a live
instance.

The instance's name is what the interface now calls this deployment, in place
of the product name it used to show everywhere. `status` reports it, along with
whether first-run setup is still outstanding.

In development nothing changes: the seed makes `admin@studio.test` the owner
and names the instance `Studio (development)`, so every boot comes up already
set up.
