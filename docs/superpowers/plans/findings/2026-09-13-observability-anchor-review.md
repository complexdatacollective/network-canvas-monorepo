# Observability anchor delivery review

The managed budget path must ship every module named by its deployment guide,
and every executable safety suite must propagate failure into the required
script CI gate. This applies to the local debit ledger, remote anchor client,
monotonic authority, and durable DynamoDB store; an entry in Knip only establishes
reachability and does not execute a test.

The seven missing anchor source/test files were recovered from durable Git
checkpoint `3797b4884`. The existing budget implementation and tests already
matched that checkpoint. The pinned DynamoDB SDK dependency is restored with
its lockfile resolution. No remote service or account was provisioned.

`scripts/studio/studio-observability-budget.test.mjs` executes the five real
`node:test` suites through the required Vitest script suite. It checks process
startup, termination and exit status. A temporary deliberately failing child
test made that required wrapper fail; restoring the original test restored a
passing wrapper. The direct suite ran 53 tests: 51 passed and two DynamoDB Local
integration tests skipped because no loopback DynamoDB endpoint was supplied.
Lint and Knip passed (the two existing configuration hints remain).

These checks establish source delivery and failure propagation, not live
DynamoDB, monitoring destination, budget or alert qualification. Those require
the managed environment and provider evidence before the epic can close.
