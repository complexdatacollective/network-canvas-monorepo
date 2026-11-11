// A compact reference to the schema 9 JSON the model must write to produce
// valid fixes, and the fix-operation syntax of the wire contract
// (../contract.ts). It is the second, unchanging part of the cached system
// prompt (./build.ts): nothing may be interpolated into it.
//
// Derived from the zod schemas in
// packages/protocol-validation/src/schemas/9 (stages, common/prompts,
// common/forms, common/panels, common/skipLogic, filters/filter, codebook,
// variables/variable, localized-string, stage-wording) and the ICU escaping in
// packages/protocol-validation/src/localization/messageSyntax.ts. It describes
// only what a fix needs to write; the model reads every other shape from the
// protocol it is given. Keep it as short as accuracy allows: it is sent with
// every review. Bump the version when the text changes.

export const PROTOCOL_REFERENCE = `# Protocol reference (schema 9), v1

This is what you need to write fixes that leave the protocol valid. For anything not described here, copy the shape the protocol already uses.

## Top level

{ "schemaVersion": 9, "name", "description"?, "localization": { "defaultLocale": "en", "locales": ["en", …] }, "codebook", "stages": [ … ], "assetManifest"?, "interfaceText"?, "experiments"? }

Never edit schemaVersion, localization, assetManifest, interfaceText or experiments.

## Text the participant reads

Every participant-facing text is an object keyed by language tag: { "en": "Who do you talk to?" }.

- Write ONLY the protocol's default language (localization.defaultLocale). To change a text, set its default-language key: /stages/<stageId>/prompts/<promptId>/text/en. A new text object holds only that key: { "en": "…" }. Never add, change or remove another language's key: a text needs a version in only one language, and the researcher's translators own the others.
- Write protocol text in the protocol's default language, whatever language your findings are in.
- Each value is an ICU MessageFormat message that must be literal text. Write a literal { or } as '{' or '}'. An apostrophe is literal ("Don't", "the participant's") except directly before another apostrophe, {, }, < or >, where it must be doubled (''). Plural, select and placeholders such as {name} are not allowed, with two exceptions: keep a placeholder that is already in a text you edit (it names one of the stage's dynamicValues), and write the minimum notice's plural exactly as shown below.
- Single-line texts (stage labels, prompts, form questions and hints, option labels, titles) cannot contain a line break. Information text items and FinishSession content may have several lines.
- Markdown (**bold**, *italic*) is allowed in prompts, form questions and hints, option labels and Information text items; stage labels and titles are plain text. Bold the key phrase of a prompt.
- A stage label is at most 100 characters.

## Codebook

{ "node"?: { <typeId>: NodeType }, "edge"?: { <typeId>: EdgeType }, "ego"?: { "variables"?: { … } } }

- NodeType: { "name", "color": "node-color-seq-1" … "node-color-seq-8", "shape": { "default": "circle" | "square" | "diamond" }, "icon"?, "variables"?: { <variableId>: Variable } }
- EdgeType: { "name", "color"?: "edge-color-seq-1" … "edge-color-seq-8", "variables"? }
- Type and variable ids are object keys matching [a-zA-Z0-9._:-]+; use a fresh UUID v4. A variable id must be unique across the whole codebook. A variable's name is its column name in exported data: unique within its entity, no leading or trailing spaces.
- Variable: { "name", "type", "component"?, "options"?, "parameters"?, "validation"? }. A variable shown in a form field must have a component.

| type | component | answer recorded | settings |
| text | Text, TextArea | a string | validation: required, minLength, maxLength, unique |
| number | Number | a number | validation: required, minValue, maxValue (whole numbers), unique |
| boolean | Boolean, Toggle | true or false | Boolean may take options: [{ "label": {…}, "value": true }, { "label": {…}, "value": false, "negative": true }]; validation: required |
| ordinal | RadioGroup, LikertScale | one option value | options (at least 2, in scale order); validation: required |
| categorical | CheckboxGroup, ToggleButtonGroup | a list of option values | options (at least 2); validation: required, minSelected, maxSelected |
| scalar | VisualAnalogScale | a number from 0 to 1 | parameters: { "minLabel"?: {…}, "maxLabel"?: {…} }; validation: required |
| datetime | DatePicker | a date | parameters: { "type"?: "full" | "month" | "year", "min"?, "max"? } as yyyy-MM-dd, yyyy-MM or yyyy |
| datetime | RelativeDatePicker | a date | parameters: { "anchor"?: yyyy-MM-dd, "before"?: days, "after"?: days } |
| layout, location | none | set by Sociogram and Geospatial | never in a form |

Options: [{ "label": { "en": "…" }, "value": 1 }, …]. A value is a whole number or text, unique within the variable. Filters and skip logic compare values, never labels. When you relabel an option, keep its value: data already collected uses it.

## Stages

Every stage: { "id", "type", "label": { "en": "…" }, "skipLogic"?, "interviewScript"? (plain text for the interviewer, never shown to the participant) }. Stages about people carry "subject": { "entity": "node", "type": <nodeTypeId> }; an AlterEdgeForm carries "subject": { "entity": "edge", "type": <edgeTypeId> }. A stage marked filter? below accepts "filter": Filter.

- Information: "title": {…}, "items": [{ "id", "type": "text", "content": {…} } | { "id", "type": "asset", "content": <assetId>, … }]
- EgoForm: "form": { "fields": [Field, …] }, "introductionPanel": { "title": {…}, "text"?: {…} }. Fields use ego variables.
- AlterForm (filter?): "form": { "fields": [ … ] }: one form per person shown. Fields use the subject node type's variables.
- AlterEdgeForm (filter?): "form": { "fields": [ … ] }: one form per tie of the subject edge type. Fields use that edge type's variables.
- NameGenerator: "form": { "title": {…}, "fields": [ … ] } (a form for each person added), "prompts", "panels"?, "behaviours"?
- NameGeneratorQuickAdd: "quickAdd": <variableId the typed name is stored in>, "prompts", "addNamePlaceholder": {…}, "panels"?, "behaviours"?
- NameGeneratorRoster: "dataSource": <assetId>, "prompts", "behaviours"?, and settings for its card list
- Sociogram (filter?): "background", "behaviours"?, "prompts": [{ "id", "text", "layout": { "layoutVariable": <layout variableId> }, "edges"?: { "create"?: <edgeTypeId>, "display"?: [<edgeTypeId>, …] }, "highlight"?: { "allowHighlighting": true, "variable": <boolean variableId> } }]. A prompt cannot both create edges and highlight.
- DyadCensus (filter?): "prompts": [{ "id", "text", "createEdge": <edgeTypeId> }]: one yes/no screen per pair.
- OneToManyDyadCensus (filter?): "behaviours": { "removeAfterConsideration": true | false }, "prompts": [{ "id", "text", "createEdge" }]
- TieStrengthCensus (filter?): "prompts": [{ "id", "text", "createEdge", "edgeVariable": <ordinal variableId of that edge type>, "negativeLabel": {…} }]
- OrdinalBin (filter?): "prompts": [{ "id", "text", "variable": <ordinal variableId>, "color": "ord-color-seq-1" … "ord-color-seq-10" }], "behaviours"?
- CategoricalBin (filter?): "prompts": [{ "id", "text", "variable": <categorical variableId>, and optionally all three of "otherVariable": <text variableId>, "otherVariablePrompt": {…}, "otherOptionLabel": {…} }], "behaviours"?
- Geospatial (filter?): "prompts": [{ "id", "text", "variable": <location variableId> }], "mapOptions", …
- Narrative (filter?): "presets": [ … ], interviewer-led; NetworkComposer, FamilyPedigree, NarrativePedigree, Anonymisation, LanguageChooser: change only their text, and copy any other shape from the protocol.
- FinishSession: ends the interview. It cannot have skipLogic. Never remove the last FinishSession, and never put a stage after it unless an earlier skip destination routes past it.

Name generator prompts: { "id", "text", "additionalAttributes"?: [{ "variable": <boolean variableId of the subject>, "value": true }] }. additionalAttributes tags everyone named at that prompt.

Name generator limits: "behaviours": { "minNodes"?: whole number ≥ 0, "maxNodes"?: whole number ≥ 1, at least minNodes }. When minNodes is above 0 the stage needs "minNodesNotice", which must count with a plural of count and #, for example { "en": "{count, plural, one {Name at least # person before you continue.} other {Name at least # people before you continue.}}" }. When maxNodes is set it needs "maxNodesNotice", plain text, for example { "en": "You have named as many people as this task allows." }. When you remove a limit, remove its notice too.

A bin stage whose behaviours.requireCompletePlacement is true needs "unplacedNodesNotice": {…}.

Form field: { "id"?: <UUID>, "variable": <variableId>, "prompt": {…}, "hint"?: {…} }. A form keeps at least one field and asks each variable once. A variable recorded by a bin, a Sociogram highlight, a census or a prompt tag must not also be asked in a form.

## Filters and skip logic

Filter: { "join"?: "AND" | "OR", "rules": [Rule, …] }: at least one rule; join is required when there is more than one.

Rule: { "id": <UUID>, "type": "node" | "edge" | "ego", "options": { "type"?: <node or edge typeId, for node and edge rules>, "attribute"?: <variableId>, "operator", "value"? } }

Operators, by the type of the attribute tested:
- any type: EXISTS (answered), NOT_EXISTS (unanswered), EXACTLY, NOT. EXACTLY and NOT compare the whole answer: true or false for a boolean, one option value for an ordinal, a list of option values for a categorical.
- text: also CONTAINS, DOES_NOT_CONTAIN (value is a regular expression).
- number, scalar, datetime: also GREATER_THAN, GREATER_THAN_OR_EQUAL, LESS_THAN, LESS_THAN_OR_EQUAL (numeric value).
- ordinal: also INCLUDES, EXCLUDES (value: one option value or a list; the answer is one of them, or none of them).
- categorical: also INCLUDES, EXCLUDES (one option value or a list: the answer holds all of them, or none of them); OPTIONS_GREATER_THAN, OPTIONS_LESS_THAN, OPTIONS_EQUALS, OPTIONS_NOT_EQUALS (value: a whole number of options selected).
- A rule with no attribute asks whether any node or edge of options.type exists: EXISTS or NOT_EXISTS only.
- NOT, EXCLUDES and DOES_NOT_CONTAIN are also true when the attribute was never answered; add an EXISTS rule joined by AND to exclude unanswered.

A stage's filter decides which nodes it shows: "node" rules test the stage's own node type. Skip logic: { "action": "SHOW" | "SKIP", "filter": Filter, "destination"?: { "type": "stage", "stageId": <a later stage's id> } | { "type": "finish" } }. SHOW shows the stage only when the filter matches; SKIP hides it when the filter matches. In skip logic an "ego" rule tests the participant, and a "node" or "edge" rule matches when at least one node or edge in the interview matches. A hidden stage continues at the next stage that shows, or at destination: a later stage, or the first FinishSession after this stage.

## Fix operations

A fix is a list of operations, applied in order; a later operation may rely on an earlier one (create a variable, then a field that uses it).

{ "op": "set" | "remove" | "insert", "path": "/…", "value": <JSON text> | null }

- path is a JSON Pointer from the protocol root (segments joined by /; inside a segment write ~1 for / and ~0 for ~), except that a segment addressing a member of an array whose members have an "id" (stages, prompts, form fields that have one, filter rules, Information items, panels, presets) is that member's id, not its index. Use an index only for arrays whose members have no id (option lists, form fields without an id, additionalAttributes). Codebook types and variables are object keys, so their id is the segment anyway.
- set writes value at path, replacing what is there or adding the key. Use it for object keys, and to replace a whole array member.
- remove deletes the key or array member at path; value is null.
- insert adds value as a new array member. The last segment says where: - appends; an existing member's id (or index) inserts before that member.
- value is the new content as JSON text: a string is written with its quotes ("\\"Close friends\\""), a number as "15", an object as "{…}". It must parse as JSON.
- New ids (stages, prompts, form fields, rules, items, codebook types and variables) are fresh UUID v4s.
- Change only the default-language key of a text; never touch another language's.
- Make the smallest edit that fixes the problem, and leave the protocol valid: every id a fix refers to must exist (or be created by an earlier operation), and every required setting must be present.
- Removing a stage or a variable: first check that nothing else refers to it (skip destinations, filters, forms, prompts, panels, other stages' settings), and change those too. Prefer removing a form field to deleting its variable.
- Moving a stage: remove it, then insert an exact copy of it (same id, every key as the protocol has it) before the stage it should precede.

Worked examples (the protocol's default language is "en"; <…> stands for ids from the protocol, or new UUIDs):

1. Rewrite a prompt:
{ "op": "set", "path": "/stages/<stageId>/prompts/<promptId>/text/en", "value": "\\"Within the **past 6 months**, who have you **discussed important matters** with?\\"" }

2. Add a filter to a stage that has none, showing only people tagged as close (a boolean):
{ "op": "set", "path": "/stages/<stageId>/filter", "value": "{\\"rules\\":[{\\"id\\":\\"<new UUID>\\",\\"type\\":\\"node\\",\\"options\\":{\\"type\\":\\"<nodeTypeId>\\",\\"attribute\\":\\"<variableId>\\",\\"operator\\":\\"EXACTLY\\",\\"value\\":true}}]}" }
To add a rule to an existing filter of one rule, insert the rule at /stages/<stageId>/filter/rules/- and set /stages/<stageId>/filter/join to "\\"AND\\"".

3. Remove a form field (one with an id, then one without):
{ "op": "remove", "path": "/stages/<stageId>/form/fields/<fieldId>", "value": null }
{ "op": "remove", "path": "/stages/<stageId>/form/fields/2", "value": null }

4. Add an ordinal variable to a node type, and a field for it at the end of a form:
{ "op": "set", "path": "/codebook/node/<nodeTypeId>/variables/<new UUID A>", "value": "{\\"name\\":\\"closeness\\",\\"type\\":\\"ordinal\\",\\"component\\":\\"RadioGroup\\",\\"options\\":[{\\"label\\":{\\"en\\":\\"Not close\\"},\\"value\\":1},{\\"label\\":{\\"en\\":\\"Close\\"},\\"value\\":2},{\\"label\\":{\\"en\\":\\"Very close\\"},\\"value\\":3}],\\"validation\\":{\\"required\\":true}}" }
{ "op": "insert", "path": "/stages/<stageId>/form/fields/-", "value": "{\\"id\\":\\"<new UUID B>\\",\\"variable\\":\\"<new UUID A>\\",\\"prompt\\":{\\"en\\":\\"How close are you to this person?\\"}}" }

5. Move a stage so it comes before another:
{ "op": "remove", "path": "/stages/<stageId>", "value": null }
{ "op": "insert", "path": "/stages/<laterStageId>", "value": "<the whole stage object, exactly as the protocol has it>" }

6. Remove a stage nothing else refers to:
{ "op": "remove", "path": "/stages/<stageId>", "value": null }

7. Cap a name generator at 15 people (when it has no behaviours yet, set "/stages/<stageId>/behaviours" to "{\\"maxNodes\\":15}" instead of the first operation):
{ "op": "set", "path": "/stages/<stageId>/behaviours/maxNodes", "value": "15" }
{ "op": "set", "path": "/stages/<stageId>/maxNodesNotice", "value": "{\\"en\\":\\"You have named as many people as this task allows.\\"}" }

8. Let participants name nobody: set "/stages/<stageId>/behaviours/minNodes" to "0", and remove "/stages/<stageId>/minNodesNotice" if the stage has one. Remove only what exists, and set a key only inside an object that exists: an operation that does not apply withdraws the whole fix.

9. Show a stage only to participants who answered yes to a boolean ego variable:
{ "op": "set", "path": "/stages/<stageId>/skipLogic", "value": "{\\"action\\":\\"SHOW\\",\\"filter\\":{\\"rules\\":[{\\"id\\":\\"<new UUID>\\",\\"type\\":\\"ego\\",\\"options\\":{\\"attribute\\":\\"<egoVariableId>\\",\\"operator\\":\\"EXACTLY\\",\\"value\\":true}}]}}" }`;
