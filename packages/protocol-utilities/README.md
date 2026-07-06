# @codaco/protocol-utilities

Synthetic network generation and interview-payload builder for Network Canvas protocols.

## Exports

- `generateNetwork(codebook, stages, options?)` — pure function that produces an `NcNetwork` (plus stage metadata and step state) for a given protocol. Used by `architect`'s PreviewHost to populate previews and by tests that need a deterministic network shape.
- `SyntheticInterview` — fluent builder that constructs codebooks, stages, prompts, forms, and full interview payloads. Used by `@codaco/interview`'s Storybook stories.

Both share a `ValueGenerator` (`@faker-js/faker` wrapper) for deterministic value synthesis.

## Consumers

- `apps/architect` — runtime use of `generateNetwork`.
- `@codaco/interview` — Storybook stories use `SyntheticInterview`. Dev-only consumer.
