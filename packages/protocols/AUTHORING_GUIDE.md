# Network Canvas Protocol Authoring Guide (schema v9)

A precise, self-contained reference for hand-authoring a **valid** `protocol.json`. Everything
here was derived directly from the Zod schema in
`packages/protocol-validation/src/schemas/9/`.
Follow it exactly.

## 0. Success criterion & how to validate

Your protocol is "done" only when this command (run from the **repo root**) exits **0**:

```bash
node packages/protocol-validation/scripts/cli.js <path-to-your-protocol.json>; echo "EXIT=$?"
```

- `EXIT=0` → valid. `EXIT=1` → invalid; the **ZodError is printed to stderr** with a `path`
  array pointing at the offending field. Read it, fix that field, re-run. Iterate to green.
- The CLI runs the built validator (`dist/index.js`). If `dist/` is missing, or older than the
  schema in `src/`, build it once with `pnpm --filter @codaco/protocol-validation build`. Do
  **NOT** run `pnpm install` or `turbo`.
- The known-good reference `packages/protocols/development/protocol.json` validates with EXIT=0
  and contains a working example of **every** stage type and variable type, in two languages
  (`en-US` and `es`). When unsure of a stage's exact shape, open it and mirror it.

## 1. Top-level structure (strict object)

```jsonc
{
  "name": "My Protocol",          // REQUIRED, non-empty string
  "description": "…",             // optional
  "schemaVersion": 9,              // REQUIRED, literal 9 (discriminator — omitting it fails)
  "localization": { "defaultLocale": "en-US", "locales": ["en-US"] }, // REQUIRED (see §2.1)
  "lastModified": "2026-06-15T00:00:00.000Z", // optional ISO datetime
  "codebook": { … },              // REQUIRED (see §3)
  "stages": [ … ],                // REQUIRED array; the last stage must be a FinishSession (see §5)
  "experiments": { "encryptedVariables": false }, // optional
  "assetManifest": { … }          // optional — OMIT IT (see §6)
}
```

## 2. Global rules (these cause most failures)

1. **Every object is a Zod `strictObject`** — unknown/extra keys fail. Do not add keys that
   aren't defined for that object. No comment keys.
2. **Valid JSON only** — no comments, no trailing commas.
3. **IDs must be unique** in their scope: `stages[].id` (across all stages); `prompts[].id`
   (within a stage); `presets[].id`, `items[].id`, `panels[].id`, filter `rules[].id`.
   Use short readable slugs (`"ng-support"`, `"p1"`) or UUIDs.
4. **Variable record-keys must match `^[A-Za-z0-9._:-]+$`** — i.e. letters, digits, `. _ - :`
   only. **NO SPACES** in a key. Use snake_case: `alter_age`, `close_feeling`. A variable's
   `name` is what researchers see in exports: it may use letters from any language, digits,
   spaces and punctuation, but must not be empty, start or end with a space, or contain control
   characters (tabs, line breaks). Simplest: make the record-key and the `name` identical.
5. **Variable `name` values must be unique within an entity** (within a node type / edge type /
   ego). **Entity display names** (`node.name`, `edge.name`) must be unique across the whole
   codebook (a node and an edge can't both be named "Person").
6. **References use record KEYS, not `name`s.** A form field's `variable`, a bin prompt's
   `variable`, etc. must equal the key under which the variable is registered in the codebook.
7. **Participant-facing text is never a plain string.** It is a localized string (§2.1):
   `"text": { "en-US": "Who do you spend time with?" }`. A bare `"text": "…"` fails.

### 2.1 Languages and localized strings

`localization` declares the languages the protocol is written in:

```jsonc
"localization": {
  "defaultLocale": "en-US",       // REQUIRED, must also appear in `locales`
  "locales": ["en-US", "es"]      // REQUIRED, ≥1 canonical BCP 47 tag, no duplicates
}
```

- Tags must be canonical (`en-US`, `es`, `ar`, `pt-BR`). `en_us` or `EN-us` fail, and the error
  names the canonical spelling.
- The order of `locales` means nothing: languages have no order, and nothing reads it. Tools list
  them alphabetically by name, and the hash of a protocol ignores the order.
- `defaultLocale` is the language an interview starts in when the participant's browser lists none
  of the protocol's languages, and the first fallback after the participant's own languages (see
  below).

Every participant-facing field holds an object keyed by those tags, one entry per translation:

```jsonc
"label": { "en-US": "Close friends", "es": "Amigos cercanos" }
```

- Every key must be one of `localization.locales`, and at least one translation is required.
- A string may leave a declared language out, including the default language, as long as it has a
  translation in at least one language. A missing translation is a warning, not a validation error.
  The participant sees the best available translation instead: first in their own language (or a
  closely related one, such as `pt-BR` for `pt-PT`), then in each other language their browser
  lists, then in the default language, then in any language of the protocol that has the text. The
  CLI does not report missing translations; call `analyzeProtocolLocalization` from
  `@codaco/protocol-validation` to list them.
- **Each value is an ICU MessageFormat message made only of literal text.** Placeholders such as
  `{name}` are not allowed. To show a literal brace, quote it: `"Pick one '{'or more'}'"` displays
  `Pick one {or more}`. An apostrophe directly before `{`, `}`, `<`, `>` or another apostrophe
  must be doubled (`''`). Any other apostrophe is literal, so `"Don't"` needs no change.
  `escapeMessageText` from `@codaco/protocol-validation` converts plain text for you.

Localized fields include: stage `label`; prompt `text`; form `title`; form field `prompt` and `hint`;
`introductionPanel.title` and `.text`; panel `title`; Information `title` and item `content` /
`description`; Narrative preset `label` and each `highlight[].label`; variable
`options[].label` and scalar `minLabel` / `maxLabel`; TieStrengthCensus `negativeLabel`;
CategoricalBin `otherVariablePrompt` and `otherOptionLabel`; Anonymisation
`explanationText.title` and `.body`; FamilyPedigree `censusPrompt`; and the codebook `label` of
every node type and edge type (§3). The validator reports any participant-facing field left as a
plain string.

Researcher-facing fields stay plain strings: the protocol `name` and `description`, codebook
`name`s, a variable's `label` (§4), `interviewScript`, ids, and asset references.

## 3. Codebook (strict: `{ node?, edge?, ego? }`)

All three are optional, but you must define any type a stage references.

```jsonc
"codebook": {
  "node": {
    "person": {                       // key = node-type id (slug, used as stage subject.type)
      "name": "Person",               // REQUIRED display name (spaces allowed here)
      "label": { "en-US": "Person" }, // REQUIRED localized name shown to participants
      "color": "node-color-seq-1",    // REQUIRED: node-color-seq-1 … node-color-seq-8
      "shape": { "default": "circle" }, // REQUIRED: default ∈ circle|square|diamond
      "icon": "add-a-person",          // optional
      "variables": { /* see §4 */ }
    }
  },
  "edge": {
    "knows": {                         // key = edge-type id (slug, used in createEdge / subject)
      "name": "Knows",                 // REQUIRED, unique across codebook
      "label": { "en-US": "Knows" },   // REQUIRED localized name shown to participants
      "color": "edge-color-seq-1",     // optional: edge-color-seq-1 … edge-color-seq-8
      "variables": { /* see §4 */ }
    }
  },
  "ego": { "variables": { /* see §4 — but ego vars may NOT use 'unique' validation */ } }
}
```

## 4. Variable definitions (strict per type)

A variable is `{ "name": <slug>, "label": <string>, "type": <type>, "component"?: <component>, … }`.
`label` is REQUIRED, non-empty plain text, and is not translated; the simplest choice is the same
text as `name` (`"label": "alter_name"`). `component` is optional but include it. The component
MUST match the type:

| type          | allowed `component`                    | extra keys                                                 | notes                                                                |
| ------------- | -------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `text`        | `Text` or `TextArea`                   | —                                                          | validation: required,minLength,maxLength,sameAs,unique,differentFrom |
| `number`      | `Number`                               | —                                                          | validation: required,minValue,maxValue,…Variable comparisons         |
| `boolean`     | `Boolean` or `Toggle`                  | `Boolean` may add `options:[{label,value:bool,negative?}]` |                                                                      |
| `ordinal`     | `RadioGroup` or `LikertScale`          | **`options` REQUIRED**                                     | validation: required,minSelected,maxSelected                         |
| `categorical` | `CheckboxGroup` or `ToggleButtonGroup` | **`options` REQUIRED**                                     | validation: required,minSelected,maxSelected                         |
| `scalar`      | `VisualAnalogScale`                    | `parameters:{minLabel?,maxLabel?}`                         |                                                                      |
| `datetime`    | `DatePicker`                           | `parameters:{type?:full\|month\|year, min?, max?}`         |                                                                      |
| `datetime`    | `RelativeDatePicker`                   | `parameters:{anchor?, before?:int, after?:int}`            |                                                                      |
| `layout`      | —                                      | —                                                          | needed for Sociogram/Narrative `layoutVariable`                      |
| `location`    | —                                      | —                                                          | needed for Geospatial prompt `variable`                              |

`options` (ordinal/categorical) = `[{ "label": { "en-US": "…" }, "value": <int|string|bool> }]`
(ordinal: use integer `value`s that encode the response — normally ascending, but an
instrument's official scoring may be encoded directly (e.g. reverse-scored EPDS items), so
non-ascending integer values are allowed). Option `label`s, and a scalar's `minLabel` /
`maxLabel`, are localized strings. Examples:

```jsonc
"alter_name":   { "name": "alter_name", "label": "alter_name", "type": "text", "component": "Text",
  "validation": { "required": true } },
"close_feeling":{ "name": "close_feeling", "label": "close_feeling", "type": "ordinal", "component": "LikertScale",
  "options": [ {"label":{"en-US":"Not close"},"value":1}, {"label":{"en-US":"Somewhat close"},"value":2},
               {"label":{"en-US":"Very close"},"value":3} ],
  "validation": { "required": true } },
"relationship": { "name": "relationship", "label": "relationship", "type": "categorical", "component": "CheckboxGroup",
  "options": [ {"label":{"en-US":"Family"},"value":"family"}, {"label":{"en-US":"Friend"},"value":"friend"} ] },
"lives_with":   { "name": "lives_with", "label": "lives_with", "type": "boolean", "component": "Boolean",
  "options": [ {"label":{"en-US":"Yes"},"value":true}, {"label":{"en-US":"No"},"value":false} ] },
"start_date":   { "name": "start_date", "label": "start_date", "type": "datetime", "component": "DatePicker",
  "parameters": { "type": "month" } },
"layout":       { "name": "layout", "label": "layout", "type": "layout" },
"alter_loc":    { "name": "alter_loc", "label": "alter_loc", "type": "location" }
```

**Avoiding duplicate alters.** When the same person may be named under more than one prompt, or
across more than one NameGenerator of the same node type, mark the name variable `"unique": true`
and give each such generator an `existing` side panel
(`"panels": [{ "id": "…", "title": { "en-US": "Already mentioned" }, "dataSource": "existing" }]`). The panel
lets the interviewer re-select an alter named earlier — keeping them one node that accumulates flags
across prompts — instead of re-typing the name and creating a duplicate node.

## 5. Stages

Base (all stages): `{ "id", "label", "type", "interviewScript"?, "skipLogic"? }` + the
type-specific keys below. `label` is a localized string; every `text`, `title`, `prompt` and
`content` below is one too (§2.1). `subject` (where present) = `{ "entity":"node", "type":"<node key>" }`
(or `entity:"edge"`). Cross-references that MUST resolve in the codebook: `subject.type`; form
field `variable`; bin/geospatial prompt `variable`; `otherVariable`; `createEdge` (→ an edge
key); TieStrength `edgeVariable` (must be an **ordinal edge** variable); sociogram/narrative
`layoutVariable`, `groupVariable`, `highlight`, `edges.create/display`.

Required keys per stage type used by these templates:

- **Information**: `items: [{ "id", "type":"text", "content":"…" }]` (use `text` items; `title?`).
- **EgoForm**: `introductionPanel:{title,text}` (REQUIRED) + `form:{title?, fields:[{variable(ego key), prompt}]}`.
- **NameGenerator**: `subject`(node) + `form:{fields:[{variable(node key), prompt}]}` (≥0 fields; include a name field) + `prompts:[{id,text, additionalAttributes?}]` (≥1) + `behaviours?:{minNodes?,maxNodes?}`.
- **NameGeneratorQuickAdd**: `subject`(node) + `quickAdd:"<a text node-variable key>"` + `prompts:[{id,text}]` (≥1). (No `form`.)
- **AlterForm**: `subject`(node) + `introductionPanel` + `form:{fields:[{variable(node key),prompt}]}` + `filter?`.
- **AlterEdgeForm**: `subject:{entity:"edge",type:"<edge key>"}` + `introductionPanel` + `form:{fields:[{variable(edge key),prompt}]}`.
- **OrdinalBin**: `subject`(node) + `prompts:[{id,text, variable:"<ordinal node key>", color?, bucketSortOrder?, binSortOrder?}]` (≥1).
- **CategoricalBin**: `subject`(node) + `prompts:[{id,text, variable:"<categorical node key>", otherVariable?, otherVariablePrompt?, otherOptionLabel?}]` (≥1).
- **Sociogram**: `subject`(node) + `prompts:[{id,text, layout:{layoutVariable:"<layout node key>"}, edges?:{create?:"<edge key>", display?:["<edge key>"]}, highlight?:{allowHighlighting?:bool, variable?:"<boolean node key>"}}]` (≥1) + `background?:{concentricCircles?:int, skewedTowardCenter?:bool, image?}`.
- **Narrative**: `subject`(node) + `presets:[{id, label, layoutVariable:"<layout node key>", groupVariable?:"<node key>", edges?:{display?:["<edge key>"]}, highlight?:[{variable:"<boolean node key>", label:{"en-US":"…"}}]}]` (≥1) + `background?` + `behaviours?:{freeDraw?,allowRepositioning?}`.
- **DyadCensus**: `subject`(node) + `introductionPanel` + `prompts:[{id,text, createEdge:"<edge key>"}]` (≥1).
- **TieStrengthCensus**: `subject`(node) + `introductionPanel` + `prompts:[{id,text, createEdge:"<edge key>", edgeVariable:"<ordinal edge key>", negativeLabel:"…"}]` (≥1).
- **Geospatial**: `subject`(node) + `prompts:[{id,text, variable:"<location node key>"}]` (≥1) + `mapOptions` (all REQUIRED):
  ```jsonc
  "mapOptions": {
    "tokenAssetId": "mapbox-token",          // free string at validation time (see §6)
    "style": "mapbox://styles/mapbox/light-v11", // must be one of the Mapbox style URLs in geospatial.ts
    "center": [-0.1278, 51.5074],            // [longitude, latitude]
    "initialZoom": 2,                         // 0–22
    "dataSourceAssetId": "boundaries-geojson",// free string at validation time
    "color": "node-color-seq-1",
    "targetFeatureProperty": "name"          // a property of the GeoJSON features
  }
  ```
- **Anonymisation**: `explanationText:{title, body}` + `validation?:{minLength?,maxLength?}`.
- **LanguageChooser**: no fields beyond the base stage (no `subject`). Lets the participant pick
  one of the protocol's `locales`, so add it only when there is more than one. Put it before any
  stage the participant should read in their chosen language, normally first:
  ```jsonc
  {
    "id": "language-chooser",
    "type": "LanguageChooser",
    "label": { "en-US": "Language", "es": "Idioma" }
  }
  ```
- **FinishSession** (REQUIRED): every protocol must end with exactly one, as its **last** stage.
  Validation refuses a protocol with no stages, one whose last stage is not a `FinishSession`,
  and any stage placed after one. No `subject`, no `skipLogic` (it is refused), and no prompts.
  Fields: `title` and `content` (both required, non-empty localized markdown strings; `title` allows
  only inline emphasis and strong) and `outcome`, one of `"completed"` (the participant reached the
  normal end), `"ineligible"` (did not qualify for the study) or `"terminated"` (the interview ended
  early for another reason, such as a distress or safety stop). The outcome is never shown to
  participants; it is recorded with the interview and exported. A skip-logic destination of
  `"finish"` goes to the first finish stage after the stage that owns the rule, which is this one.
  ```jsonc
  {
    "id": "finish",
    "type": "FinishSession",
    "label": { "en-US": "Finish Interview" },
    "title": { "en-US": "Finish Interview" },
    "content": {
      "en-US": "You have reached the end of the interview. If you are satisfied with the information you have entered, you may finish the interview now.",
    },
    "outcome": "completed"
  }
  ```

## 6. Assets — keep it simple

The validator does **not** cross-check asset references, and a malformed `assetManifest`
**will** fail. Therefore:

- **Omit `assetManifest` entirely** for most templates.
- For `Information`, use only `type:"text"` items (no asset items). Do **not** embed images,
  banners, or other media — keep these screens text-only.
- For `Geospatial`, embed a working `assetManifest` so the map renders out of the box:
  - A `type:"apikey"` asset holding the **shared Mapbox testing token** as its `value` (the
    same literal as `TESTING_MAPBOX_TOKEN` in
    `apps/architect/src/templates/testingMapboxToken.ts`), referenced by `tokenAssetId`.
    The token is rate-limited and for evaluation only; its presence is detected by value and
    surfaces a "replace before deploying" warning on the protocol timeline in Architect. Tell
    the researcher to swap in their own token in the stage's `interviewScript` and in the
    researcher-notes screen below.
  - A `type:"geojson"` boundary asset whose `source` is a file bundled under
    `packages/protocols/templates/<id>/assets/` (loaded into the library by `apps/architect/src/templates/template-assets.ts`),
    referenced by `dataSourceAssetId`. Each feature must expose the property named in
    `targetFeatureProperty` (e.g. `name`).

## 7. Researcher-facing notes — keep them in the protocol

Setup steps, instrument sources, and caveats belong **in the protocol** so they reach whoever
opens it in Architect. Put them in a dedicated `Information` stage as the **first** stage of the
protocol, with a single `type:"text"` item (`"size":"LARGE"`) and a label that flags it for
removal, e.g.:

```jsonc
{
  "id": "information-researcher-notes",
  "type": "Information",
  "label": { "en-US": "Template notes (delete before fielding)" },
  "title": { "en-US": "Template notes" },
  "items": [
    {
      "id": "researcher-notes",
      "type": "text",
      "size": "LARGE",
      "content": {
        "en-US": "## For researchers\n\n_Delete this screen before you field the study._\n\n…sources, setup, and caveats…",
      },
    },
  ],
}
```

Participant-facing `Information` screens should also use a **single** `type:"text"` item
(`"size":"LARGE"`) holding all the screen's content as Markdown, rather than several smaller
items, so the screen reads as one block.

## 7. Workflow

1. Draft `protocol.json`. 2. Run the §0 command. 3. If EXIT=1, read the ZodError `path`/`message`,
   fix exactly that, re-run. 4. Repeat until EXIT=0. 5. Spot-check that your codebook keys referenced
   by stages all exist and types match (ordinal-where-ordinal-required, etc.).
