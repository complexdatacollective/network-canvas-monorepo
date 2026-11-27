# Schema 9: directed edges, multiplex stages and stage-owned layouts

Status: approved 2026-11-26, revised 2026-11-27 (see Revisions).

This design replaces an earlier plan for a flat attribute registry, which was
withdrawn before any of it was built and is not in the repository.

## Intent

Network Canvas should be able to collect directed ties (advice, supervision,
referral) and networks with more than one kind of node on a single canvas
(people and organisations, for example). Both go into schema 9, which is
scheduled and unreleased.

The earlier plan reached multiplex by flattening every variable into one
registry. That was a very large change made mainly so that a canvas showing
several node types could share one layout attribute. This design keeps
variables nested under ego, node types and edge types, and changes only the
thing that does not fit that nesting: a layout belongs to a canvas, so it
becomes a construct of its own.

## Goals

- Edge types can be directed.
- Edge types can restrict which node types they connect (endpoint rules).
- Stages that present a canvas or a census can include several node types.
- Layouts are defined once and shared by every node type a stage places.
- Every stage type has a stated behaviour for directed edges and for several
  node types, including the stages where the answer is "no change".

## Non-goals

- A flat attribute registry, or sharing one variable definition between
  entity types.
- Several node types on name generators, bins, Alter Form, Geospatial or the
  pedigree stages.
- Splitting the pedigree edge type into a directed parent type and an
  undirected partner type. Worth its own project after schema 9.
- Any change to how filter and skip logic rules behave (#2725), apart from
  keeping rules about layouts working and the limit on conditions about a
  census pair or a Network Composer node on a stage with several node types
  (see "Piped text on census stages" and "Network Composer").
- Any change to `apps/architect-classic` or `apps/interviewer-classic`.
- Migrating stored interview sessions, or upgrading protocols inside Fresco or
  Interviewer.

## Anti-goals

- Matching variables across node types by name or by identical option lists.
  Every place where that was the easy answer has been decided the other way.
- Validation accepting a protocol the interview cannot run.
- A setting that is silently ignored. A setting that cannot apply is either
  not offered, rejected by validation, or explained beside the control.

## Constraints

- Schema 9 is unreleased. Edit the schema 9 tree and `migrationV8toV9` in
  place. Data saved in schema 9 by development builds needs no handling. The
  migration does not need to be deterministic or safe to run twice.
- Stored sessions are never rewritten.
- Work lands through step pull requests into
  `integration/schema-9-multiplex-directed`, then one pull request into `main`.
  The design is one deliverable; the step pull requests are a review
  convenience and no step is released on its own.
- Stable row IDs (#1523) are landing separately. Rows this design adds that
  are edited or reordered independently carry an `id` in the same style:
  highlight entries, sort rules, Network Composer node entries. Endpoint rules
  carry none, since they are compared by value and their order means nothing.
- Repository rules in `CLAUDE.md` apply: no barrel files, no re-exports, no
  `any`, explicit `.ts` extensions in protocol-validation and shared-consts,
  `developing-network-canvas-ui` before the first user-facing edit,
  `verifying-translations` before any translation is committed.

## Approaches

Three ways of supporting several node types on a canvas were considered.

1. Shared variable by ID. A variable could be attached to several node types,
   each holding a copy of the definition. Rejected by the author: it duplicates
   definitions and needs machinery to keep the copies in step.
2. Flat attribute registry. All variables move to one registry and "which
   attributes a type has" is derived from the stages that write or import
   them. Planned in full, then withdrawn: it rewrites every reader of the
   codebook in every package to solve a problem that is concentrated in one
   variable type.
3. Nested variables plus stage-owned layouts (chosen). Variables stay where
   they are. Layouts move out of node types into their own record, and "which
   node types have this layout" is derived from the stages that set it. Other
   per-type attributes on a multi-type stage (highlight, sorting, forms) are
   configured once per node type.

## The data model

### Edge types

```ts
type EdgeDefinition = {
  // existing: name, color, variables, ...
  directed?: true;
  endpointRules?: Array<{ sourceType: string; targetType: string }>;
};
```

- `directed` is stored only when true. An undirected type looks exactly as it
  does today. (My call.)
- `endpointRules` absent means any two nodes may connect. When present it is
  non-empty, every type exists, and no pair appears twice.
- `sourceType === targetType` allows two different nodes of that type. No edge
  type allows a node to connect to itself.
- For an undirected type a rule is an unordered pair: `{A, B}` and `{B, A}`
  are the same rule and the second is rejected. For a directed type the order
  is source then target.
- Migration leaves every existing edge type undirected with no rules.

Shared helpers, exported from `@codaco/protocol-validation` and used by every
consumer so that no package reads `directed` or `endpointRules` itself. A
repository test enforces this permanently. When it fails, its message tells the
developer what to do, and the rule is written down where contributors look for
it.

```ts
isDirectedEdgeType(codebook, edgeType): boolean;
edgeTypeAllowsEndpoints(codebook, edgeType, sourceNodeType, targetNodeType): boolean;
getEligibleOrderedPairs(codebook, edgeType, nodes): Array<[N, N]>;
validateNetworkAgainstEndpointRules(network, codebook): EndpointRuleProblem[];
```

Edge identity lives in `@codaco/shared-consts` (`src/edge-identity.ts`, its own
subpath export):

```ts
edgeIdentityKey(edge, directed): string;
findEdge(edges, endpoints, directed): E | undefined;
toggleEdge(edges, endpoints, directed):
  | { action: 'remove'; edge: E }
  | { action: 'add' }
  | { action: 'refuse'; reason: 'selfLoop' };
```

For an undirected type, A to B and B to A are the same edge. For a directed
type they are two edges that can both exist. Stored edges do not carry a
`directed` key; direction is always read from the edge type.

### Node stage subjects

Every node stage subject becomes a list:

```ts
type NodeStageSubject = { entity: 'node'; types: [string, ...string[]] };
```

Non-empty, no duplicates, every type exists. The order is the researcher's and
is used where a stage shows types in sequence. One capability table in
protocol-validation says how many node types each stage type accepts, and
validation rejects more. (My call: one subject shape for every node stage,
with the table enforcing "exactly one" where that applies, so there is one way
to read a node subject.)

Network Composer is the one node stage without a stage subject. Its node types
are the node types of its node entries, in entry order (see Network Composer).
Code that needs a stage's node types asks one accessor, which reads the
subject of most stages and the node entries of a Network Composer.

| Accepts one or more node types                                                                                               | Exactly one node type                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Sociogram, Narrative, Dyad Census, One-to-Many Dyad Census, Tie Strength Census, Network Composer (through its node entries) | Name Generator (form, quick add, roster), Categorical Bin, Ordinal Bin, Alter Form, Geospatial, Family Pedigree |

Migration turns each schema 8 `{ entity: 'node', type }` into a one-element
list, except on Network Composer, where it becomes the stage's first node
entry.

### Layouts

```ts
type Codebook = {
  // existing: ego, node, edge
  layouts?: Record<string, { name: string }>;
};
```

- A layout is not a node variable. Node types no longer hold variables of type
  `layout`.
- Positions are still stored on each node under the layout's ID, so interview
  data keeps its shape.
- Only nodes have layouts.
- Layout names are unique among layouts and may not equal the name of a
  variable on any node type. Exports derive several column names from a
  layout's name (`name_x`, `name_y`, the screen-space pair, and GraphML's
  `_X` and `_Y`, see `packages/shared-consts/src/export-columns.ts`), and the
  rule covers every derived name as well.
- A stage sets a layout or reads it:

  | Stage                                                     | Access |
  | --------------------------------------------------------- | ------ |
  | Sociogram with a layout task, or with automatic layout on | sets   |
  | Network Composer                                          | sets   |
  | Sociogram with neither                                    | reads  |
  | Narrative preset                                          | reads  |

- A node type has a layout when a stage that sets it uses that node type: in
  its subject, or, for Network Composer, in its node entries. Reading does not
  count. This is computed when needed and never stored. The
  codebook screen, the exporters and filter authoring all use the one helper.
- A layout that no stage references is unused. It is listed as such and can be
  deleted. Deleting a layout that a stage references is refused in every app.
  A filter or skip logic rule that names a layout is a use as well, handled as
  a rule that names a variable is today: in Architect the deletion is refused
  while a rule names the layout; in Studio the rule is removed with the
  layout.
- Architect shows an advisory when a stage that reads a layout includes a node
  type that no stage sets that layout for, since those nodes can never have a
  position. It is an advisory in the builder only. `validateProtocol` has no
  warnings channel and does not gain one. (My call.)
- Migration turns each schema 8 `layout` variable on a node type into a
  layout with the same ID and name and removes it from that type.
- Schema 9 no longer allows a variable of type `layout` anywhere. The shared
  variable schema let ego and edge types hold one, though no stage can write
  it. Migration removes those, with any filter rule that names them. (My
  call.)

## Stage behaviour

### Sociogram

The Sociogram is redesigned so that each prompt is one task.

- The stage names one layout. It no longer varies by prompt.
- Each prompt has `task: 'layout' | 'highlight' | 'connect'`.
  - Layout: the participant drags nodes from the bucket onto the canvas. A
    stage may have more than one layout task.
  - Highlight: tapping a node toggles a boolean attribute. The prompt holds
    one entry per node type that takes part, each naming (or creating) a
    boolean variable on that type. Nodes cannot be moved.
  - Connect: the participant creates edges of one edge type. Nodes cannot be
    moved.
- Each prompt still lists the edge types to display.
- Highlights are visible only during a highlight task. A prompt cannot show a
  highlight attribute without letting the participant toggle it.
- A stage with automatic layout turned on sets the layout itself and needs no
  layout task. (My call.)
- Architect shows an alert when a stage is the first to use a layout and its
  first prompt is not a layout task.

Disabled nodes use the `disabled` prop of the `Node` component, which dims the
node and blocks interaction. A story and a test must prove this for custom
node shapes. Nodes are disabled when:

- in a highlight task, their type has no highlight attribute on the prompt;
- in a connect task, they are not a valid source for the edge type, or, after
  the first tap, not a valid target for the selected node;
- in a highlight or connect task, they have no position and are still in the
  bucket. They stay visible there so the gap is evident. (My call.)

Unplaced-node bucket sorting:

- Sort rules are written per node type.
- A new optional rule sorts by node type in an order the researcher sets. When
  absent, types follow subject order.
- Both apply to the sort settings of stages that accept several node types,
  which are the Sociogram and One-to-Many Dyad Census. Sort rules on the bin
  stages and the roster keep their current shape. (My call.)

Directed edges:

- The first tap selects the source and the second the target. No extra marker
  is drawn during selection.
- Tapping a connected pair in the same order removes that edge. Tapping it in
  reverse order adds the opposite edge.
- A directed edge has an arrowhead at the target. A reciprocal pair is one
  line with an arrowhead at each end, and removing one direction leaves the
  other with its single arrowhead.

### Narrative

- Accepts several node types.
- Each preset names a layout and reads it.
- Highlight toggles are entries with a researcher-written label and one
  boolean attribute per node type, the same shape as a Sociogram highlight
  task. One switch lights matching nodes of every type that has an attribute
  in the entry.
- Group regions are offered only when the stage has one node type.
- Directed edges and reciprocal pairs are drawn as on the Sociogram.
- Free-draw and repositioning are unchanged. Repositioning is temporary and
  does not write to the layout.

### Name Generator (form, quick add, roster)

- Exactly one node type. Side panels show that type only.
- No change for directed edges.

### Dyad Census

- Accepts several node types. Pairs come from all nodes of those types,
  limited to pairs the prompt's edge type allows.
- Validation rejects a prompt whose edge type allows no pair among the stage's
  node types.
- For a directed edge type each pair is asked as two yes or no steps, one per
  direction, back to back, with an arrow between the two nodes showing the
  direction being asked. One prompt text serves both directions.
- A direction that already exists shows as answered yes. "No" removes only the
  direction being asked.
- A direction the endpoint rules do not allow is skipped.

### One-to-Many Dyad Census

- Accepts several node types. Each node takes a turn as the focal node, and
  its list holds only nodes the endpoint rules allow it to connect to. A node
  with no valid partners is skipped.
- For a directed edge type the prompt says whether the focal node is the
  source (the default) or the target.
- "Remove after consideration" applies to undirected prompts only. For a
  directed prompt every valid node is listed on every turn, and Architect says
  so beside the option.
- Endpoint rules on a directed type respect the source or target setting.
- A direction that already exists shows as selected. Deselecting removes only
  that direction.

### Tie Strength Census

- Follows Dyad Census for several node types, endpoint rules, two back-to-back
  steps per pair for a directed type, and one prompt text.
- Each direction is its own edge with its own strength value. "No tie" removes
  only the direction being asked.

### Network Composer

- Accepts several node types, and stores them only in its node entries. The
  stage has no stage-level subject. Its list of node entries is shaped like
  its existing list of edge entries: each has an `id`, its own subject naming
  one node type, a toolbar label, a quick-add attribute and an optional form.
  The quick-add attribute and the form fields are resolved against the entry's
  node type, as an edge entry's form is resolved against its edge type.
- No two node entries may name the same node type, as for edge entries. The
  stage's node types are the entries' node types, in entry order.
- Each node entry is its own toolbar button. Pressing it opens the label input
  for a new node of that type. Migration builds the first entry from the
  schema 8 stage's node type, quick-add attribute and form, fills its toolbar
  label with the node type's name and removes the stage subject. (My call on
  the label.)
- The stage names a layout and always sets it.
- Group regions are offered only when the stage has exactly one node entry.
  The group attribute is then resolved against that entry's node type.
- In Studio, deleting a node type that one of several node entries names
  removes that entry, as deleting an edge type removes the edge entry that
  names it today. In Architect the deletion is refused while any stage uses
  the type, as it is today for an edge type that an edge entry names.
  Deleting the node type of a stage's only node entry is refused everywhere.
- In the stage editor, removing a node entry or changing its node type is
  refused, with the list of connections, when an edge entry's type would be
  left with no pair it allows.
- A node entry's form and quick-add field can pipe the label and attributes
  of the node being added, resolved against the entry's node type. A
  condition about the node may test node attributes only when the stage has
  one node entry; with several it may hold edge and edge-count rules only, as
  for the census roles below.
- With an edge type selected, nodes its endpoint rules rule out are disabled.
- Drawing a directed edge follows the Sociogram: first node source, second
  target, reverse order adds the opposite edge, one line with two arrowheads
  for a reciprocal pair.
- Selecting a reciprocal line shows both edges in the inspector as two
  labelled sections, each with its own form and its own delete.
- The inspector offers "Reverse direction" for a directed edge. It keeps the
  edge's form values and is unavailable when the opposite edge exists.

### Categorical Bin and Ordinal Bin

- Exactly one node type. Sort rules unchanged. The sort-by-node-type rule is
  not offered.
- No change for directed edges.

### Ego Form, Alter Form, Alter Edge Form

- Ego Form: no change.
- Alter Form: exactly one node type.
- Alter Edge Form: the two nodes may be of different types and each is drawn
  in its own type's style. For a directed type the source is drawn first and
  the target second, with an arrowhead at the target. The existing piped-text
  roles for the two ends of an edge mean source and target for a directed
  type. A reciprocal pair's two forms are shown back to back.

### Family Pedigree and Narrative Pedigree

- Exactly one node type.
- The pedigree edge type must be undirected. Validation rejects a pedigree
  bound to a directed type. The interface keeps reading source as parent and
  target as child on parent edges through the kind attribute, as now.
- If the pedigree edge type has endpoint rules, they must allow the pedigree's
  node type to connect to itself.
- Narrative Pedigree keeps its own drawing and does not use arrowheads.

### Geospatial, Anonymisation, Information, Language Chooser, Finish Session

- Geospatial: exactly one node type. No change for directed edges.
- The others involve no node or edge type. No change.

## Piped text on census stages

Dyad Census, Tie Strength Census and One-to-Many prompts can pipe attributes of
the two nodes in a pair, or of the focal node, resolved against the stage's
single node type. When such a stage has one node type this is unchanged. When
it has more than one, those roles offer the node label only, as the two ends
of an edge already do, and validation rejects an attribute. (My call.)
A condition about one of those roles may not test a node attribute when the
stage has several node types; it may still hold edge and edge-count rules.
Inserting attributes there, and node rules in those conditions, are tracked
in #2727 and will be designed together with the filter and skip logic rules
(#2725).

## Filters and skip logic

Filter and skip logic rules behave exactly as they do in schema 8. Their
redesign for several node types and directed edges is tracked in #2725 and is
not part of this design.

- Under "match all", each node rule removes nodes of every other type. A
  "match all" filter on a stage with several node types therefore keeps only
  the node type its rules are about.
- An edge rule keeps both ends of a matching edge, whatever the direction of
  its edge type. A filter cannot choose the source or the target end of a
  directed edge.
- Skip logic ignores direction.
- Rules about layouts keep working, because removing the layout variable type
  would otherwise break them. A node rule that named a layout variable in
  schema 8 now names the layout, which keeps the variable's ID and the same
  four operators. Such a rule validates and runs as before. The rule editor
  treats a layout as it treated a layout attribute: it is listed for the node
  types that have it, marked as not usable in a rule, and offered no
  operator, since a position has no value a rule can compare against. A
  stored rule that names a layout opens showing the layout's name, is
  described by that name, and can be pointed at another attribute or
  deleted.
- The only other change to rules is the limit on conditions about a census
  pair or a Network Composer node on a stage with several node types,
  described above.

## Checking a network against endpoint rules

`validateNetworkAgainstEndpointRules` reports self-loops, duplicates, missing
endpoints and endpoint types an edge type does not allow. It is called where a
network asset is checked when a researcher adds it in Architect, and as an
assertion over generated networks in the synthetic-data tests. The interview
does not run it. (My call.)

## Export

- Edge list CSV: no new column. For a directed type each row is one edge,
  source to target.
- Adjacency matrix: rows are sources and columns are targets for a directed
  type, so the matrix need not be symmetric.
- GraphML: the graph stays declared undirected and each edge of a directed
  type carries `directed="true"`.
- Node attribute lists: unchanged, except that a layout's `name_x` and
  `name_y` columns appear in a node type's file when the type has the layout,
  and also whenever a node of that type holds a position.
- Endpoint rules do not appear in data exports.

## Architect

Codebook screen and printable codebook:

- A "Layouts" section lists each layout with the stages that set it, the
  stages that read it and the node types that have it. Each node type's entry
  lists its layouts, read-only, linking back.
- An unused layout is listed with a delete action. A layout that only a rule
  names is not unused in Architect: it has no delete action and its entry
  lists the stages whose rules name it.
- Each edge type's entry shows whether it is directed and its endpoint rules
  in words.

Edge type editor, including inline creation from a stage:

- A "Directed" switch and an "Allowed connections" list. Rows are two node
  type pickers, labelled "From" and "To" for a directed type and "Between" and
  "and" for an undirected one.
- Switching "Directed" on a type that stages use is allowed behind a
  confirmation listing the affected stages and what changes. Going back to
  undirected removes the source or target setting on One-to-Many Dyad Census
  prompts. Filter and skip logic rules need no change, since they ignore
  direction. The switch is refused when a Family Pedigree is bound to the
  type.
- Saving endpoint rules that would leave a stage with nothing valid to do is
  refused, with the list of stages.
- Deleting a node type that an endpoint rule names is blocked until the rule
  is removed.

Stage editors follow the behaviour sections above. Every new control gets a
story, and every changed interface gets an interactive story, a capture story
and regenerated interface images, as the repository's conventions require.

## Synthetic data

`@codaco/protocol-utilities` generation:

- generates positions for a layout on the nodes of every type in a stage that
  sets it;
- creates directed edges with ordered identity, so a reciprocal pair counts as
  two edges;
- respects endpoint rules when choosing pairs;
- handles the directed forms of the three census stages and the source or
  target setting.

## Migration summary (schema 8 to 9)

1. Node subjects become one-element `types` lists, except on Network Composer,
   whose subject step 7 removes.
2. Each `layout` variable becomes an entry in `codebook.layouts` with the same
   ID and name and is removed from its node type.
3. Sociogram prompts are rewritten into the task model. A prompt that creates
   edges becomes a connect task, one that allows highlighting becomes a
   highlight task, and any other becomes a layout task. Nothing is added: a
   stage whose prompts all create edges or highlight migrates with no layout
   task, and Architect's alert tells the researcher. A display-only highlight
   on a prompt is removed.
4. A Sociogram whose prompts use different layout variables is split into
   consecutive stages, one for each run of prompts that share a layout. Each
   new stage copies the original's label and settings and takes a new ID.
5. Sociogram and Narrative highlight settings become per-type entries holding
   the stage's single node type.
6. Sort rules on the Sociogram and One-to-Many Dyad Census gain their node
   type.
7. Network Composer's single node type, quick-add attribute and form become
   one node entry, and the stage subject is removed. Its layout variable
   becomes the stage's layout.
8. Edge types are left as they are. Filter and skip logic rules are left as
   they are, apart from any that name a removed ego or edge layout variable. A
   rule naming a node layout variable keeps working, because the layout keeps
   the variable's ID.

Canonical protocols, templates and fixtures are re-saved once, after the
migration is complete.

## Documentation

Researcher documentation for directed edge types, endpoint rules, layouts, the
Sociogram task model and each changed stage is part of this deliverable, in
the Documentation changeset lane, with translations verified.

The documentation on filtering and skip logic states plainly that:

- a "match all" filter on a stage with several node types keeps only the node
  type its rules are about;
- filters cannot yet choose the source or the target end of a directed edge;
- skip logic ignores direction.

## GitHub issues

#1532 and #1669 to #1674 still describe the withdrawn flat registry. They are
updated and closed once this design has been implemented, and not before.

Two issues hold work that this design leaves out:

- #2725: the filter and skip logic rule system, to be redesigned as a whole
  for several node types and directed edges.
- #2727: inserting attributes in census piped text on a stage with several
  node types, to be designed together with #2725.

## Left to the builder

- Exact schema field names beyond those shown, following the surrounding
  schema 9 conventions.
- How the step pull requests into the integration branch are divided.
- Visual details of arrowheads, the reciprocal line and the direction arrow on
  census screens, within the fresco-ui design system.
- Wording of Architect alerts, confirmations and validation messages.

## Revisions

2026-11-27:

- Network Composer stores its node types only in its node entries and has no
  stage-level subject.
- Filter and skip logic rules are out of this design (#2725), apart from
  keeping rules about layouts working.
- Census piped text on a stage with several node types stays label only;
  attributes there are tracked in #2727.
- The notice about a layout that no stage sets for a node type stays an
  Architect notice only.
- The test that stops code reading `directed` or `endpointRules` outside the
  helpers is permanent, with a failure message that says what to do.
