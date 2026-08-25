# @codaco/protocol-utilities

Synthetic interview generation and protocol builder for Network Canvas
protocols.

## Exports

- `generateInterviews(protocol, options, assetData?, onProgress?)` — walks a
  **schema-parsed** protocol stage by stage as a participant would and returns
  `SyntheticInterviewResult[]`: complete Interviewer-shaped sessions
  (`session` with network, stage metadata, and real timestamps), each with its
  resume position (`currentStep`), whether it was abandoned (`droppedOut`),
  and the stages it visited. Options: `count` (up to
  `MAX_SYNTHETIC_INTERVIEWS`), `seed` (default `DEFAULT_SYNTHETIC_SEED`),
  `simulateDropOut`, `respectSkipLogic`, `minimumCompletedRatio`, `stopAt`
  (preview a prefix; mutually exclusive with dropout), `startWindow` (pin for
  byte-reproducible batches), `familyPedigree` (run-level population options),
  `captureTrace`, and `overrides` (fixture entities applied at their stage's
  creation draw).
- `generateInterviewsAsync(protocol, options, assetData?, onProgress?, batch?)`
  — the same batch, byte for byte, drawn so that the thread it runs on stays
  usable: the driver hands control back between sessions (`batch.sliceMs`, one
  frame by default; `batch.yieldControl` for a host with a scheduler of its
  own). **Every browser host uses this one.** Drawing a session costs real work
  and a batch may ask for `MAX_SYNTHETIC_INTERVIEWS` of them, so the
  synchronous driver holds the tab for the whole run, with its `onProgress`
  never reaching a frame it could render in. `generateInterviews` stays right
  for a caller that owns its thread: a server route, a test, a one-session
  preview.
- `ProtocolBuilder` — fluent builder for codebooks, stages, prompts, forms,
  and full interview payloads. `getProtocolParsed()` returns the schema-parse
  of the built document; `getInterviewPayload(opts)` delegates to
  `generateInterviews`, so builder-produced sessions and generated sessions
  are the same artifact; `getNetwork()` is a thin accessor over it.
- `generateCorpusProtocol(index)` — seeded generated protocol shapes for
  acceptance-corpus testing, with their roster pools.
- `SyntheticDataConstraintError`, `ConstraintConflict` — the structured
  refusal generation throws, and the shape it carries. See below.
- `MAX_SYNTHETIC_INTERVIEWS`, `DEFAULT_SYNTHETIC_SEED` — the run options.
  Every other number that shapes generated data lives in the protocol itself,
  as stage- and variable-level `synthetic` descriptors resolved by
  `@codaco/protocol-validation`'s schema; a source-level guard in this
  package's tests refuses any generation-side default.

## How generation works

One linear walk is the only model of stage behaviour: each interface type has
exactly one simulator, which may write only what a participant operating that
interface could write, through the same action vocabulary the interview's own
Redux store folds. Fidelity is not a review claim — a replay-parity oracle in
`@codaco/interview` dispatches captured write traces through the real store
and requires the identical session, over hand-built fixtures for every
interface type, the bundled protocols whole, and a corpus slice.

Sessions are byte-reproducible: ids, timestamps, values, and dropout rolls all
come from seeded substreams, so a `(seed, startWindow)` pair reproduces a
batch exactly, and extending a batch never disturbs its earlier members.
Dropout is a per-stage hazard on cumulative response burden (each stage's
`synthetic.responseBurden`), so demanding stages late in long protocols end
sessions the way real fatigue does; dropped sessions are genuine abandoned
interviews with a resume position, and `minimumCompletedRatio` tops a batch up
deterministically.

Roster and geojson content comes from the HOST: pass
`assetData.rosterNodes[stageId]` / `assetData.geojsonPropertyValues[stageId]`
(the interview contract's `collectRosterExternalData` /
`collectGeospatialPropertyValues` produce them). An absent `assetData` map
opts out of the contract; a present map missing a stage's key is an unresolved
source.

## Refused protocols

Generated values satisfy the validation rules a protocol declares plus the
rules its interfaces imply, so a synthetic session holds only data a
participant could have entered. Where the declared constraints cannot all be
satisfied, generation refuses **before any seed is drawn** with
`SyntheticDataConstraintError` — the same refusal on every seed. The pre-seed
gate covers roster pools below a stage's own minimum, `unique` variables whose
effective value space is smaller than the walk's guaranteed demand, and
censuses whose author-declared population exceeds the pair cap. The error's
`conflicts` array names the entity, variables, and rules per problem; a
consumer can render it directly.

## Family pedigree generation

FamilyPedigree stages use an isolated demographic generator. The bundled
`US_FAMILY_PEDIGREE_POPULATION` profile derives completed family sizes from
the 2017–2019 National Survey of Family Growth, then uses size-biased draws
for a focal person's siblings and parents' sibling groups; it includes source
URLs so callers can audit or replace the profile. Pass the `familyPedigree`
option to customise the population, cap optional branches, disable planted
disease lineages, or force an adoption, donor-conception, or surrogacy
scenario. Family topology uses a stage-specific deterministic stream, so
changing a pedigree does not move the draws of other stages.

## Consumers

- `apps/interviewer` — the synthetic-data panel generates batches through
  `generateInterviews`.
- Fresco — the generate-test-interviews route, with a server-side asset
  resolver.
- `apps/architect` — stage previews build their session with
  `stopAt: { stageIndex }`.
- `@codaco/interview` — `ProtocolBuilder` builds Storybook and E2E fixtures.
  Dev-only consumer.
