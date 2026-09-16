---
'@codaco/studio-server': patch
---

The environment declaration moves to Effect Schema v4.

`src/env/schema.ts` says the same things in Effect 4's vocabulary: exact
optional fields are `Schema.optionalKey`, refinements are `check`s, the two
transformed variables are built with `decodeTo`, and a refusal message is a
plain string that replaces what Effect would have composed. What a deployer
sees is unchanged — a bad environment still names every offending variable in
one report, still says what each value must be, and still never prints the
value it rejected. `.env.development`, `.env.example` and the README's
environment table generate byte-for-byte as before.

Two details changed because Effect 4's schema AST did. The documentation each
variable carries is keyed by namespaced strings rather than symbols, because
v4's annotation record is string-keyed; and it is read back from the schema
node and its checks together, because `annotate` on a schema that carries
checks attaches to the last check rather than to the node.

`Environment` is a `Context.Service` under the id `@studio/Environment`, with
`layer` and `layerWithMail` unchanged. `readEnv()` is unchanged for its
callers.

Separately, the reference compose stack gives the worker 40 seconds to stop.
No service set `stop_grace_period`, so Docker was sending SIGKILL after its
default 10 seconds while the worker's documented drain takes 25–30 — long
enough that a redeploy could kill a job mid-flight.
