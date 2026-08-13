# @codaco/protocol-utilities

Synthetic network generation and interview-payload builder for Network Canvas protocols.

## Exports

- `generateNetwork(params)` — pure function that produces an `NcNetwork` (plus stage metadata and step state) for a given protocol. Takes a single `GenerateNetworkParams` object: `codebook` and `stages` are required; `externalData`, `seed`, `simulateDropOut`, `respectSkipLogicAndFiltering`, `inProgressStageIndex`, `config`, and `familyPedigree` are optional. Returns a `GenerateNetworkResult`.
- `GenerateNetworkParams`, `GenerateNetworkResult` — the parameter and result types.
- `GenerationConfig` — run-level session controls: the drop-out factor, the fraction of an in-progress stage left unanswered, and the date relative date bounds resolve against. `params.config` takes a `Partial` of it.
- `SyntheticDataConstraintError`, `ConstraintConflict` — the refusal `generateNetwork` throws, and the shape it carries. See below.
- `SyntheticInterview` — fluent builder that constructs codebooks, stages, prompts, forms, and full interview payloads.

Both share a `ValueGenerator` (`@faker-js/faker` wrapper) for deterministic value synthesis: pass a `seed` for reproducible output.

## What a generated network looks like

How much data a protocol produces is declared in the protocol itself, through
optional `synthetic` metadata, rather than passed to `generateNetwork`:

- **Entity-creating stages** declare how many people they add (`synthetic.count`
  on the name generators and Network Composer) and how densely they link the
  people they can see (`synthetic.topology` on the Sociogram, the censuses and
  Network Composer). A count belongs to the asking rather than the asked-about:
  three name generators over one node type each nominate their own people.
- **Codebook variables** declare how their values are distributed — option
  weights, a selection-count table, a text generator, a missing probability.
- **FamilyPedigree** declares nothing. A family is a structure rather than a
  population, so it sizes itself; a host may still bound its optional branches
  through the `familyPedigree` parameter.

Anything left undeclared uses documented defaults, so a protocol carrying no
`synthetic` metadata generates exactly as it did before.

> **Removed in v4.** `GenerationConfig` no longer carries `nodeCount`,
> `rosterDrawRatio`, `sociogramEdgeProbability`, `sociogramLayoutRange`,
> `censusEdgeProbability`, `networkComposerEdgeProbability` or
> `familyPedigreeNodeCount`. These are replaced by the metadata above. A
> JavaScript caller still passing them gets no type error and
> `resolveGenerationConfig` will carry the extra properties, but generation
> ignores them — move the quantity onto the stage or variable that owns it.

## Family pedigree generation

FamilyPedigree stages use an isolated demographic generator rather than the generic node-and-edge stage handlers. The bundled `US_FAMILY_PEDIGREE_POPULATION` profile derives completed family sizes from the 2017–2019 National Survey of Family Growth, then uses size-biased draws for a focal person's siblings and parents' sibling groups. It includes source URLs so callers can audit the assumptions or replace the profile for another study population.

Pass `familyPedigree` to customize the population, cap optional branches, disable planted disease lineages, or force an adoption, donor-conception, or surrogacy scenario for testing. Population mode samples these scenarios at the profile's configured rates. Family topology and attributes use a stage-specific deterministic random stream, so changing a pedigree does not move the random stream used by other interview stages.

## Refused protocols

Generated values satisfy the validation rules a protocol declares on its variables, so a synthetic network holds only data a participant could have entered. Where a protocol's rules cannot all be satisfied at once, `generateNetwork` throws `SyntheticDataConstraintError` rather than emitting data the interview would reject.

Most refusals are decided before anything is drawn, from the declared bounds alone, so they do not depend on the seed. The remainder are raised while drawing, when a variable runs out of values against the ones its rules tie it to.

The error's `conflicts` array carries one `ConstraintConflict` per problem, each naming the entity (`entity`, plus `entityType` and `entityTypeName` for nodes and edges), the `variableIds` and `variableNames` involved, the `rules` at issue, and a `reason`. A consumer can render these directly; the error's `message` is the same information as text.

## Consumers

- `apps/architect` — `generateNetwork` populates protocol previews.
- `apps/interviewer` — `generateNetwork` backs synthetic interview generation.
- `@codaco/interview` — `SyntheticInterview` builds Storybook and E2E fixtures. Dev-only consumer.
- Fresco — external consumer of `generateNetwork`.
