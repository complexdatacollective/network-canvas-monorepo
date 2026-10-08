# @codaco/protocol-utilities

Synthetic network generation and interview-payload builder for Network Canvas protocols.

## Exports

- `generateNetwork(params)` — pure function that produces an `NcNetwork` (plus stage metadata and step state) for a given protocol. Takes a single `GenerateNetworkParams` object: `codebook` and `stages` are required; `externalData`, `seed`, `simulateDropOut`, `respectSkipLogicAndFiltering`, `inProgressStageIndex`, and `config` are optional. Returns a `GenerateNetworkResult`.
- `GenerateNetworkParams`, `GenerateNetworkResult` — the parameter and result types.
- `GenerationConfig` — tuning constants (node counts, edge probabilities, drop-out factor, and the date relative date bounds resolve against). `params.config` takes a `Partial` of it.
- `SyntheticDataConstraintError`, `ConstraintConflict` — the refusal `generateNetwork` throws, and the shape it carries. See below.
- `SyntheticInterview` — fluent builder that constructs codebooks, stages, prompts, forms, and full interview payloads.

Both share a `ValueGenerator` (`@faker-js/faker` wrapper) for deterministic value synthesis: pass a `seed` for reproducible output.

## Localization

`SyntheticInterview` builds schema-9 protocols, so every protocol it emits carries a `localization` declaration. The default is `en-US` as both the default and the only language. `setLocalization({ defaultLocale, locales })` replaces it, and may be called before or after the stages are added.

Participant-facing text accepts either a plain string or a locale map:

- A plain string is written in `defaultLocale` and escaped as an ICU literal message, so `{` and `'` appear to the participant exactly as typed.
- A locale map (`{ en: '...', es: '...' }`) passes through as written. Its values must already be ICU literal messages, and a language missing from the map has no translation for that string.

This covers stage labels, prompts, form fields, panels, options, and node and edge types. Every node type, edge type, and variable (ego variables included) gets a `label`, which is the entry's `name` unless you pass one. A variable's label is not translated, so it takes a plain string only. Each attribute a Narrative preset highlights is labelled with the attribute's name, as text in the default language. A Network Composer field is captioned the same way, with its attribute's name, unless you pass a `label`.

`addStage('LanguageChooser')` adds a language chooser stage. It has no subject and adds nothing to the generated network.

```ts
import { SyntheticInterview } from '@codaco/protocol-utilities';

const synth = new SyntheticInterview();
synth.setLocalization({ defaultLocale: 'en-US', locales: ['en-US', 'es'] });

const person = synth.addNodeType({
  name: 'Person',
  label: { 'en-US': 'Person', 'es': 'Persona' },
});

synth.addStage('LanguageChooser');

const friends = synth.addStage('NameGenerator', {
  subject: { entity: 'node', type: person.id },
  label: { 'en-US': 'Friends', 'es': 'Amigos' },
});
friends.addPrompt({
  text: { 'en-US': 'Name your friends', 'es': 'Nombra a tus amigos' },
});

const protocol = synth.getProtocol(); // protocol.localization is the declaration above
```

## Family pedigree stages

`generateNetwork` adds no people or relationships for a FamilyPedigree stage: the participant draws their own family in the interface. `SyntheticInterview.addStage('FamilyPedigree')` builds a valid stage, creating the person and family types and the variables the interface owns; the returned handle exposes their ids so a story can seed people and relationships.

## Refused protocols

Generated values satisfy the validation rules a protocol declares on its variables, so a synthetic network holds only data a participant could have entered. Where a protocol's rules cannot all be satisfied at once, `generateNetwork` throws `SyntheticDataConstraintError` rather than emitting data the interview would reject.

Most refusals are decided before anything is drawn, from the declared bounds alone, so they do not depend on the seed. The remainder are raised while drawing, when a variable runs out of values against the ones its rules tie it to.

The error's `conflicts` array carries one `ConstraintConflict` per problem, each naming the entity (`entity`, plus `entityType` and `entityTypeName` for nodes and edges), the `variableIds` and `variableNames` involved, the `rules` at issue, and a `reason`. A consumer can render these directly; the error's `message` is the same information as text.

## Consumers

- `apps/architect` — `generateNetwork` populates protocol previews.
- `apps/interviewer` — `generateNetwork` backs synthetic interview generation.
- `@codaco/interview` — `SyntheticInterview` builds Storybook and E2E fixtures. Dev-only consumer.
- Fresco — external consumer of `generateNetwork`.
