# @codaco/protocol-utilities

Synthetic network generation and interview-payload builder for Network Canvas protocols.

## Exports

- `generateNetwork(params)` — pure function that produces an `NcNetwork` (plus stage metadata and step state) for a given protocol. Takes a single `GenerateNetworkParams` object: `codebook` and `stages` are required; `externalData`, `seed`, `simulateDropOut`, `respectSkipLogicAndFiltering`, `inProgressStageIndex` and `config` are optional. Returns a `GenerateNetworkResult`.
- `GenerateNetworkParams`, `GenerateNetworkResult` — the parameter and result types.
- `GenerationConfig` — tuning constants (node counts, edge probabilities, drop-out factor, and the date relative date bounds resolve against). `params.config` takes a `Partial` of it.
- `SyntheticDataConstraintError`, `ConstraintConflict` — the refusal `generateNetwork` throws, and the shape it carries. See below.
- `SyntheticInterview` — fluent builder that constructs codebooks, stages, prompts, forms, and full interview payloads.

Both share a `ValueGenerator` (`@faker-js/faker` wrapper) for deterministic value synthesis: pass a `seed` for reproducible output.

## Refused protocols

Generated values satisfy the validation rules a protocol declares on its variables, so a synthetic network holds only data a participant could have entered. Where a protocol's rules cannot all be satisfied at once, `generateNetwork` throws `SyntheticDataConstraintError` rather than emitting data the interview would reject.

Most refusals are decided before anything is drawn, from the declared bounds alone, so they do not depend on the seed. The remainder are raised while drawing, when a variable runs out of values against the ones its rules tie it to.

The error's `conflicts` array carries one `ConstraintConflict` per problem, each naming the entity (`entity`, plus `entityType` and `entityTypeName` for nodes and edges), the `variableIds` and `variableNames` involved, the `rules` at issue, and a `reason`. A consumer can render these directly; the error's `message` is the same information as text.

## Consumers

- `apps/architect` — `generateNetwork` populates protocol previews.
- `apps/interviewer` — `generateNetwork` backs synthetic interview generation.
- `@codaco/interview` — `SyntheticInterview` builds Storybook and E2E fixtures. Dev-only consumer.
- Fresco — external consumer of `generateNetwork`.
