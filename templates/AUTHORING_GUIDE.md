# Network Canvas Protocol Authoring Guide (schema v8)

A precise, self-contained reference for hand-authoring a **valid** `protocol.json`. Everything
here was derived directly from the Zod schema in
`packages/protocol-validation/src/schemas/8/`. Follow it exactly.

## 0. Success criterion & how to validate

Your protocol is "done" only when this command (run from the **repo root**) exits **0**:

```bash
node packages/protocol-validation/scripts/cli.js <path-to-your-protocol.json>; echo "EXIT=$?"
```

- `EXIT=0` → valid. `EXIT=1` → invalid; the **ZodError is printed to stderr** with a `path`
  array pointing at the offending field. Read it, fix that field, re-run. Iterate to green.
- The validator (`dist/index.js`) is **already built**. Do **NOT** run `pnpm install`,
  `pnpm build`, or `turbo` — just run the `node ... cli.js` command.
- The known-good reference `packages/development-protocol/protocol.json` validates with EXIT=0
  and contains a working example of **every** stage type and variable type. When unsure of a
  stage's exact shape, open it and mirror it.

## 1. Top-level structure (strict object)

```jsonc
{
  "name": "My Protocol",          // REQUIRED, non-empty string
  "description": "…",             // optional
  "schemaVersion": 8,              // REQUIRED, literal 8 (discriminator — omitting it fails)
  "lastModified": "2026-06-15T00:00:00.000Z", // optional ISO datetime
  "codebook": { … },              // REQUIRED (see §3)
  "stages": [ … ],                // REQUIRED array (see §5)
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
4. **Variable record-keys AND every variable `name` must match `^[A-Za-z0-9._:-]+$`** — i.e.
   letters, digits, `. _ - :` only. **NO SPACES.** Use snake_case: `alter_age`, `close_feeling`.
   Simplest: make the record-key and the `name` identical.
5. **Variable `name` values must be unique within an entity** (within a node type / edge type /
   ego). **Entity display names** (`node.name`, `edge.name`) must be unique across the whole
   codebook (a node and an edge can't both be named "Person").
6. **References use record KEYS, not `name`s.** A form field's `variable`, a bin prompt's
   `variable`, etc. must equal the key under which the variable is registered in the codebook.

## 3. Codebook (strict: `{ node?, edge?, ego? }`)

All three are optional, but you must define any type a stage references.

```jsonc
"codebook": {
  "node": {
    "person": {                       // key = node-type id (slug, used as stage subject.type)
      "name": "Person",               // REQUIRED display name (spaces allowed here)
      "color": "node-color-seq-1",    // REQUIRED: node-color-seq-1 … node-color-seq-8
      "shape": { "default": "circle" }, // REQUIRED: default ∈ circle|square|diamond
      "icon": "add-a-person",          // optional
      "variables": { /* see §4 */ }
    }
  },
  "edge": {
    "knows": {                         // key = edge-type id (slug, used in createEdge / subject)
      "name": "Knows",                 // REQUIRED, unique across codebook
      "color": "edge-color-seq-1",     // optional: edge-color-seq-1 … edge-color-seq-8
      "variables": { /* see §4 */ }
    }
  },
  "ego": { "variables": { /* see §4 — but ego vars may NOT use 'unique' validation */ } }
}
```

## 4. Variable definitions (strict per type)

A variable is `{ "name": <slug>, "type": <type>, "component"?: <component>, … }`. `component`
is optional but include it. The component MUST match the type:

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

`options` (ordinal/categorical) = `[{ "label": "…", "value": <int|string|bool> }]` (ordinal:
use integer `value`s that encode the response — normally ascending, but an instrument's official
scoring may be encoded directly (e.g. reverse-scored EPDS items), so non-ascending integer values
are allowed). Examples:

```jsonc
"alter_name":   { "name": "alter_name", "type": "text", "component": "Text", "validation": { "required": true } },
"close_feeling":{ "name": "close_feeling", "type": "ordinal", "component": "LikertScale",
  "options": [ {"label":"Not close","value":1}, {"label":"Somewhat close","value":2}, {"label":"Very close","value":3} ],
  "validation": { "required": true } },
"relationship": { "name": "relationship", "type": "categorical", "component": "CheckboxGroup",
  "options": [ {"label":"Family","value":"family"}, {"label":"Friend","value":"friend"} ] },
"lives_with":   { "name": "lives_with", "type": "boolean", "component": "Boolean",
  "options": [ {"label":"Yes","value":true}, {"label":"No","value":false} ] },
"start_date":   { "name": "start_date", "type": "datetime", "component": "DatePicker", "parameters": { "type": "month" } },
"layout":       { "name": "layout", "type": "layout" },
"alter_loc":    { "name": "alter_loc", "type": "location" }
```

**Avoiding duplicate alters.** When the same person may be named under more than one prompt, or
across more than one NameGenerator of the same node type, mark the name variable `"unique": true`
and give each such generator an `existing` side panel
(`"panels": [{ "id": "…", "title": "Already mentioned", "dataSource": "existing" }]`). The panel
lets the interviewer re-select an alter named earlier — keeping them one node that accumulates flags
across prompts — instead of re-typing the name and creating a duplicate node.

## 5. Stages

Base (all stages): `{ "id", "label", "type", "interviewScript"?, "skipLogic"? }` + the
type-specific keys below. `subject` (where present) = `{ "entity":"node", "type":"<node key>" }`
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
- **Narrative**: `subject`(node) + `presets:[{id, label, layoutVariable:"<layout node key>", groupVariable?:"<node key>", edges?:{display?:["<edge key>"]}, highlight?:["<boolean/categorical node key>"]}]` (≥1) + `background?` + `behaviours?:{freeDraw?,allowRepositioning?}`.
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

## 6. Assets — keep it simple

The validator does **not** cross-check asset references, and a malformed `assetManifest`
**will** fail. Therefore:

- **Omit `assetManifest` entirely.**
- For `Information`, use only `type:"text"` items (no asset items).
- For `Geospatial`, put descriptive placeholder strings in `tokenAssetId` / `dataSourceAssetId`
  (they validate as plain strings). In `NOTES.md`, state that the researcher must attach a
  Mapbox token asset and a GeoJSON boundary file in Architect for the stage to run.
- If you find suitable openly-licensed images, list their URLs/licences in `NOTES.md` — do not
  embed them.

## 7. Workflow

1. Draft `protocol.json`. 2. Run the §0 command. 3. If EXIT=1, read the ZodError `path`/`message`,
   fix exactly that, re-run. 4. Repeat until EXIT=0. 5. Spot-check that your codebook keys referenced
   by stages all exist and types match (ordinal-where-ordinal-required, etc.).
