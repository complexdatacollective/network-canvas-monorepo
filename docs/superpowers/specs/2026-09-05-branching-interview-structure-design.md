# Branching Interview Structure Design

**Status:** Draft for review (2026-09-05). Moves to GitHub issues under the
Schema 9 tracker once approved.

**Tracking:** to be filed under #1514 (Protocol Schema 9 coordinated tracker)
after approval. Rescopes #1548 (protocol builder: skip logic Section) and
extends #1282 (template system) with a new template kind.

**Related:** #1523 (stable protocol-wide IDs), #1661 and #1537 (typed
condition AST), #1475 (protocol localization, `LocalizedString`), #1522
(dynamic attributes in participant text), #1536 and #1656 (missing data and
the exposure ledger), #1426 (synthetic interview generation), #1279 (in-editor
preview), #1647 (completion-time estimate), the Dynamic Rosters design
(`docs/superpowers/specs/2026-08-25-dynamic-rosters-design.md`, which creates
Schema 9), and the Schema 8 corrections design
(`docs/superpowers/specs/2026-08-25-schema-8-corrections-design.md`).

## 1. Summary

Today an interview is a flat list of stages. The only deviation from that
line is skip logic: a rule attached to a stage that hides the stage and,
optionally, jumps forward to a later stage or to the end. Because the rule
lives on the stage being hidden, a researcher who wants to branch on what was
just collected has to attach the rule to the _following_ stage, and a
protocol that needs separate streams of stages for different participants
cannot say so directly.

Schema 9 replaces the flat stage list with a **timeline**: an ordered tree of
three kinds of item.

- A **stage** is what it is today: one interview screen.
- A **group** is an ordered sequence of items with a single entry point and a
  single exit point. Groups nest. A group is the unit that templates share,
  and it moves as one thing on the timeline.
- A **decision point** is a node on the timeline where conditions are
  evaluated and the interview is redirected. It has an ordered list of
  outcomes, each with a condition and a link, and an "otherwise" link that
  applies when no outcome matches.

Links are how the route leaves the straight line. A decision point outcome
links forward to a later item in the same sequence, and a group's exit point
may link forward to a later item in the sequence that contains the group.
Links never point backward, never into the middle of a group, and never
outside the group that contains the decision point. Per-stage skip logic is
removed; migration turns every existing skip rule into an equivalent decision
point.

The end of the interview becomes a real stage. A **finish stage** has a
researcher-editable, localized title and body, and declares an outcome kind
(`completed`, `ineligible`, or `terminated`) that hosts record and exports
carry. A protocol may contain several finish stages. Migration appends one
`completed` finish stage to every existing protocol.

The route is always computed from the current interview data, exactly as
skip logic is evaluated today: when data changes, the route changes. A
participant standing on a stage that has just left the route is not
interrupted: they finish that stage, and their next navigation takes them to
the nearest stage still on the route.

### 1.1 Decisions this design records

Taken 2026-09-05 in the design interview with the product owner. Each is
quoted as the option chosen.

1. **Branch shape: "Links to later items."** A decision point outcome names a
   later item and the interview jumps there. The alternative, inline lanes
   nested under the decision point that rejoin automatically, was rejected.
2. **Skip logic: "Remove it; decision points only."** Schema 9 has one routing
   mechanism. Migration converts existing skip logic; the editor offers a
   one-click "skip this stage when…" shortcut that builds the equivalent
   decision point.
3. **Finish screens: "Ordinary stages placed inline."** A finish stage is a
   stage like any other, placed wherever the interview should end. Two places
   ending with the same text hold two finish stages.
4. **Evaluation: "Continuously, as today."** The active route is a pure
   function of the protocol and the current interview data. No outcome is
   remembered by the session.
5. **Rejoining: "Link on the group's exit point."** A group's exit point may
   carry one link saying where the interview continues after the group. Links
   exist in exactly two places: decision point outcomes and group exits.
6. **Link targets: "Later items in the same sequence only."** A link may point
   at a later sibling of the decision point (or of the exiting group): a
   stage, a decision point, a child group as a whole, or a finish stage.
   Never into a group's interior, never outside the enclosing group. A group
   that needs to end the interview early contains its own finish stage.
7. **Direction: "Forward only."** No loops. Repeating a section is out of
   scope.
8. **Groups in the interview: "Section headings in the stage menu only."**
   The interviewer's stage menu lists stages under their group labels.
   Participants never see group names, and progress is not grouped.
9. **Finish text: "Title and body text."** Both are localized rich text and
   may contain dynamic attributes. The Finish button and the confirmation
   dialog stay application-owned.
10. **Finish outcome: "Each finish stage declares an outcome."** The kinds are
    `completed`, `ineligible`, and `terminated` (option "completed,
    ineligible, terminated"). Every kind ends the interview the same way.
11. **Naming: "Decision point, with outcomes."** The fallback is "otherwise".
12. **Delivery:** "spec file and PR, but moved to github issues when approved
    and linked to the schema 9 epic."
13. **Recovery (follow-up on the PR draft): "Move the participant at the next
    Next instead of immediately."** A stage that leaves the route while the
    participant is on it stays on screen until they navigate away; today's
    immediate move is dropped.
14. **Timeline rendering (same follow-up):** "a branching tree structure
    rather than the single line with messy connections … a hierarchical
    graph layout similar to what we implemented for the family pedigree
    layout." Architect's timeline is a layered graph, not a list with
    arrows. Refined on the first graph draft: "have the optional modules
    either side of the center line, with the otherwise line passing straight
    down the middle." The default path is the spine; outcomes open to either
    side of it.

Technical positions recorded without a product question are marked
"(recommendation)" where they appear below.

## 2. Goals

- Let a researcher branch the interview at the point where the branching
  data has just been collected, not on the following stage.
- Let a protocol contain separate streams of stages for different
  participants, whether or not those streams rejoin.
- Let the interview end in more than one place, with researcher-written text
  and a recorded outcome for each ending.
- Make a group of stages a first-class, movable, shareable unit.
- Keep one routing mechanism, one evaluation model, one migration target, and
  one documentation form.
- Preserve the behaviour of every existing protocol exactly through the v8→v9
  migration.

## 3. Non-goals

- Backward links, loops, or repeating a group per alter or "until satisfied".
- Links that leave the enclosing group or enter the interior of another
  group.
- Participant-visible section names or grouped progress.
- Any change to what a stage can do once it is reached; branching affects
  only which stages are reached.
- A participant-driven choice of route. Decision points read data; they do
  not ask.
- Studio-specific storage, collaboration, or publishing behaviour. Groups as
  section documents in the sectioned store (#1276) are a consequence of the
  template design, not part of this contract.

## 4. The timeline

### 4.1 Shape

The protocol's top-level `stages` array becomes `timeline`, an ordered,
non-empty array of timeline items (recommendation: the key is renamed because
every consumer of `stages` must change anyway, and a tree of stages, groups,
and decision points is not a list of stages). Items are discriminated by
`kind`, matching the `kind: 'field' | 'group'` convention of conditional
forms (#1537).

```ts
type Timeline = [TimelineItem, ...TimelineItem[]];

type TimelineItem = StageItem | GroupItem | DecisionPointItem;

type StageItem = {
  kind: 'stage';
  id: ProtocolObjectId;
  type: StageType; // 'NameGenerator', 'EgoForm', 'FinishSession', …
  label: LocalizedString; // localized under #1475 (rendered in the stage menu)
  interviewScript?: string;
  // …the interface's own configuration, unchanged
};

type GroupItem = {
  kind: 'group';
  id: ProtocolObjectId;
  label: LocalizedString; // rendered as a heading in the stage menu
  description?: string; // author-facing notes, like interviewScript
  items: [TimelineItem, ...TimelineItem[]];
  exit: RouteTarget; // where the interview continues after the group
};

type DecisionPointItem = {
  kind: 'decision';
  id: ProtocolObjectId;
  label: string; // author-facing only
  outcomes: [Outcome, ...Outcome[]]; // evaluated in order; first match wins
  otherwise: RouteTarget; // applies when no outcome matches
};

type Outcome = {
  id: ProtocolObjectId;
  label?: string; // author-facing; defaults to a summary of the condition
  condition: Condition; // the Schema 9 condition AST (#1661)
  target: RouteTarget;
};

type RouteTarget =
  | { kind: 'next' } // the item after this one in the same sequence
  | { kind: 'item'; itemId: ProtocolObjectId }; // a later sibling
```

A **sequence** is any ordered list of items: the top-level `timeline` or a
group's `items`. Every item belongs to exactly one sequence. Every object
above carries a stable protocol-wide UUID under #1523: stages, groups,
decision points, and outcomes. `otherwise` is a fixed slot on its decision
point and has no id of its own.

`RouteTarget` is always an explicit object; there is no "absent means next"
rule, so a strict schema can reject partial objects and the editor always
shows where an exit goes.

### 4.2 Document order

Document order is the depth-first order of the tree: an item, then (for a
group) its contents, then the next sibling. Stage numbering in Architect, the
interviewer's stage menu, the numeric step used by hosts, and the printed
summary all use document order. Because every link points forward within its
sequence, the route through an interview always visits stages in increasing
document order (see §7.2).

## 5. Groups

A group is an ordered, non-empty sequence of items with one entry point and
one exit point.

- **Entry.** The interview enters a group only at its first item: by falling
  through from the previous sibling, or by a link that names the group. A
  link may never name an item inside a group from outside it.
- **Exit.** When the last item of a group's sequence is passed, or a link
  inside the group targets `next` past its end, the group's `exit` decides
  where the interview continues in the parent sequence: `next` continues at
  the item after the group; `item` continues at a later sibling of the group.
  If the group is the last item of its parent and its exit is `next`, the
  parent's own exit applies, recursively.
- **Nesting.** Groups may contain groups to any depth. Validation guards
  against pathological depth and size the same way #1537 does for forms.
- **Self-containment.** Because links inside a group can only name items in
  the same sequence, a group's contents never reference anything outside the
  group except the codebook. That is what makes a group a shareable unit.
- **Moving.** Moving a group on the timeline moves its contents and every
  link inside it, unchanged. A group's own exit link is validated against its
  new position like any other link.
- **Labels.** The group label is `LocalizedString` because the stage menu
  renders it (decision 8). Group labels are never shown inside a stage and
  never appear in participant-facing progress.
- **No condition on a group.** Groups do not carry conditions (decision 2).
  "Show this group only when…" is a decision point placed before the group.

## 6. Decision points

A decision point sits between items on the timeline. It renders no screen: a
participant never sees it and Back never lands on it.

### 6.1 Outcomes

Outcomes are ordered. When the route reaches a decision point, its outcomes
are evaluated top to bottom against the current interview data; the first
outcome whose condition holds supplies the link that is followed. If none
holds, `otherwise` supplies the link. The editor shows this order explicitly
("checked top to bottom, first match wins") and lets outcomes be reordered.

Every outcome and the `otherwise` slot may target `next` or any later sibling
in the decision point's own sequence, including a finish stage placed there
and a later group as a whole.

### 6.2 Conditions

A condition is the Schema 9 typed condition AST specified for conditional
forms (#1537 §3, delivered by #1661): recursive `and` / `or` / `not` /
`comparison` nodes, each with a stable id, no executable code, operators and
values validated against the resolved source type, and #1536's
missing-value operators available wherever the source can hold a value.

At a decision point the sources available are the ones that exist at the
interview level, outside any form (recommendation):

1. **Ego attribute:** a contextual attribute reference with the ego role.
2. **Network query:** the shared framework-free network-query model, which
   is what today's skip-logic filter is — existence, counts, and attribute
   predicates over nodes and edges of a type.
3. **Interview and protocol metadata:** allow-listed typed values from the
   #1522 context registry, such as `interview.caseId` or `protocol.name`.

The "current form field" source has no meaning at a decision point and is not
offered. Node, edge, and dyad roles are not offered either: no single entity is
in context on the timeline.

Josh's description called this "an enhanced version of the existing skip
logic system": the enhancement is that one rule set becomes one outcome among
several, and rule sets compose with `and` / `or` / `not` under #1661 instead
of a single flat `join`.

### 6.3 Placement

A decision point may appear anywhere in any sequence, including first (to
route on roster, starting-network, or metadata values before any stage) and
directly after another decision point. It may not be the only item of the
timeline, because every route must end at a finish stage (§8.2).

## 7. Route evaluation

### 7.1 The rule

The active route is a pure function of the protocol and the current
interview state (network plus allow-listed metadata). It is recomputed
whenever that state changes, and nothing about a previously taken outcome is
remembered by the session (decision 4). This is the model the runtime already
implements for skip logic; only the input shape changes.

### 7.2 The walk

Route computation walks the timeline from its first item, maintaining a stack
of the sequences it is inside:

1. **Stage:** append it to the route. If it is a finish stage, stop. Otherwise
   continue with the next item in the current sequence.
2. **Group:** push its sequence and continue with its first item.
3. **Decision point:** evaluate outcomes in order; take the first matching
   target, else `otherwise`. `next` continues with the following item;
   `item` continues at that later sibling.
4. **End of a sequence:** if inside a group, pop and apply the group's
   `exit` in the parent sequence. At the top level the walk has run off the
   end, which validation forbids (§8.2); the runtime treats it as an
   invariant violation and hosts never start an unvalidated protocol.

Because every link is forward within its sequence and groups are entered only
at their start, the walk terminates and visits stages in increasing document
order. The result is:

```ts
type Route = {
  stages: ProtocolObjectId[]; // stages on the active route, in order
  availability: Record<ProtocolObjectId, StageAvailability>;
  decisions: Record<ProtocolObjectId, ProtocolObjectId | 'otherwise'>;
};

type StageAvailability =
  | { kind: 'available' }
  | {
      kind: 'off-route';
      divertedBy:
        | { kind: 'decision'; decisionId: ProtocolObjectId; outcomeId: ProtocolObjectId | 'otherwise' }
        | { kind: 'group-exit'; groupId: ProtocolObjectId };
    };
```

`availability` replaces today's `local-skip` / `bypassed` distinction. The
`divertedBy` record is what the stage menu uses to explain why a stage is
greyed out, and what the exposure ledger records (§11).

### 7.3 Navigation

- **Next** moves to the following stage on the route. **Back** moves to the
  preceding stage on the route. Decision points are never landed on.
- **Recovery.** A participant is never moved while they are on a stage. If
  the stage they are on leaves the route, it stays on screen, its prompts and
  before-navigation handlers keep working, and the move happens at the
  navigation that would leave the stage: Next goes to the nearest later stage
  on the route in document order, Back to the nearest earlier one. Because a
  form commits inside that navigation, the route is recomputed after the
  handlers run and before the destination is chosen, so an answer changed on
  the way out is honoured. The exposure ledger records the stage as presented
  (§11). The render gate still stops an off-route stage from being _entered_,
  except through the stage menu below; it no longer unmounts the one the
  participant is already on (decision 13; this replaces today's immediate
  move).
- **Stage menu.** The interviewer's stage menu renders the timeline in
  document order with groups as nested headings (decision 8). Decision points
  are not listed. Off-route stages are greyed and, exactly as today, may be
  forced with a confirmation that quotes the diverting decision point or
  group exit by label.
- **Progress.** Progress is position on the active route divided by route
  length, finish stage included. When the route changes, progress changes
  with it. The host step contract's `totalSteps` becomes the route length
  (recommendation).
- **Host step addressing.** Hosts keep addressing the current step as a
  number, now defined as the index of the stage in the document-order list
  of all stages, finish stages included (recommendation: it keeps Fresco's
  and Interviewer's stored step columns and the `initialStageOverrideIndex`
  prop meaningful without a contract rewrite). A resumed step that is off
  route renders, and the participant moves at their next navigation as
  above. Progress holds its last on-route value while the participant is on
  an off-route stage.

### 7.4 Preview

Architect preview and the in-editor preview (#1279) keep their split:
from-start preview honours decision points; a stage-scoped start disables
routing and shows every stage as available, because a mid-interview entry has
no coherent route state.

## 8. Finish stages

### 8.1 The interface

`FinishSession` becomes a real stage type in the schema; the runtime's
synthetic appended stage is removed.

```ts
type FinishSessionStage = {
  kind: 'stage';
  type: 'FinishSession';
  id: ProtocolObjectId;
  label: LocalizedString;
  title: LocalizedString; // rich text; dynamic attributes allowed (#1522)
  content: LocalizedString; // rich text; dynamic attributes allowed (#1522)
  outcome: 'completed' | 'ineligible' | 'terminated';
};
```

- `title` and `content` are participant-facing localized rich text under
  #1475 and may contain #1522 dynamic attributes, so a closing screen can
  address the participant by a collected name or quote a count.
- The Finish button label and the "Are you sure?" confirmation stay
  application-owned (decision 9). Hosts continue to supply the confirmation
  description that explains what finishing does on that host.
- The stage keeps today's behaviour: it flushes pending sync before calling
  the host's finish handler, and it is the last stage on any route.

### 8.2 Every route ends at a finish stage

Validation walks every path through the timeline (a finite acyclic graph,
conditions ignored) and rejects the protocol if any path reaches the end of
the top-level sequence without passing a finish stage. The error is reported
at the last item of that path.

A finish stage may appear anywhere a stage may: at the end of the top-level
timeline, inside a group that screens participants out, or at the end of an
exclusive stream. An item after a finish stage in the same sequence is legal
only if some link reaches it from before the finish stage; otherwise it is
unreachable and rejected (§9).

### 8.3 Outcome kinds

Every finish stage declares one of three kinds (decision 10):

| Kind         | Meaning                                                                             |
| ------------ | ----------------------------------------------------------------------------------- |
| `completed`  | The normal end of the interview. Default for the migrated finish stage.             |
| `ineligible` | The participant did not qualify; a screening decision point ended the interview.    |
| `terminated` | Any other early end the protocol decides on, for example a distress or safety stop. |

All three finish the interview identically: the same flush, the same host
finish handler, the same "finished" state. Withdrawal by the participant is a
host action, not a protocol route, and is not in this list.

The runtime passes the finish stage id and its outcome kind to the host's
finish handler. Hosts persist both alongside `finishedAt` (Fresco's
`Interview` row, Interviewer's session record, Studio's interview record) and
exporters write the outcome kind as session-level metadata next to the
existing session fields in every format that carries them. Retrospective
`notAsked` projection (#1536 §6) applies to interviews finished at any finish
stage; the outcome kind is exported so analysts can separate endings.

## 9. Validation

Blocking rules, in addition to the Schema 9 rules every object already
carries (#1523 ids, #1475 localized strings, #1661 condition validity):

1. `timeline` and every group's `items` are non-empty; every decision point
   has at least one outcome.
2. Every `item` target resolves to a **later sibling in the same sequence** as
   the decision point (for an outcome or `otherwise`) or as the group (for an
   `exit`). A target that is the item itself, an earlier sibling, an item in a
   different sequence, or a missing id is rejected with the path of the link.
3. Every path through the timeline ends at a finish stage (§8.2).
4. Every stage is reachable on at least one path. An item that no path
   reaches, for example a stage placed after a finish stage with no link that
   skips the finish, is rejected at the item.
5. Every condition uses only sources available at the interview level
   (§6.2), with operator and value typing per #1661.
6. Every reference to an earlier stage (Narrative Pedigree's `sourceStageId`,
   and any future schema-marked stage reference) names a stage that is on
   **every** path to the referencing stage. Structurally: the referenced
   stage is an earlier sibling in the same sequence, or inside an earlier
   sibling group, or an earlier sibling of an enclosing group, and no link
   between the two can bypass it. A stage that is sometimes skipped may not be
   a source for one that is always shown.
7. Every finish stage declares an outcome kind.
8. Tree depth and size stay within the same guard used for recursive forms.

Rule 6 replaces today's "source stage must come before" index comparison; the
walk that proves rule 3 produces the path information rules 4 and 6 need.

Architect surfaces these as problems on the timeline while a draft is being
edited (a group that has just been created is empty; a finish stage that has
just been dropped mid-sequence leaves items unreachable) and prevents export
until they are resolved, as it does for existing validation errors.

## 10. Migration (v8→v9)

The single combined v8→v9 migration (#1514, #1451) performs these steps for
this feature, deterministically and without mutating its input:

1. **Rename and tag.** `stages` becomes `timeline`; every stage gains
   `kind: 'stage'`.
2. **Append the finish stage.** One `FinishSession` stage is appended with
   `outcome: 'completed'`, a deterministic id under #1523, and today's
   built-in text in the protocol's default locale: label and title "Finish
   Interview", content "You have reached the end of the interview. If you
   are satisfied with the information you have entered, you may finish the
   interview now."
3. **Convert skip logic.** For each stage `S` with `skipLogic`, insert a
   decision point immediately before `S` with one outcome and
   `otherwise: { kind: 'next' }`:
   - condition: the schema 8 filter wrapped as a network-query condition
     when `action` is `SKIP`, and the same wrapped in `not` when `action` is
     `SHOW` (exact node shapes per #1661);
   - target, when `destination` names a stage: the migrated decision point
     that now precedes that stage if it has one, otherwise the stage itself.
     Targeting the decision point rather than the stage preserves today's
     rule that a destination's own skip logic is still evaluated, so
     destinations chain;
   - target, when `destination` is `finish`: the appended finish stage;
   - target, when there is no `destination`: the item after `S` (its
     migrated decision point if it has one), or the appended finish stage
     when `S` is last;
   - label: `Skip "<S label>"`; outcome label: `Skip`.
     Schema 8 validation already guarantees every destination is a later
     top-level stage, so every migrated link is a later sibling. Overlapping
     skip ranges need no special handling: the walk evaluates each decision
     point when it is reached and skips the ones a link jumps over, which is
     exactly today's "rules on bypassed stages are not evaluated".
4. **Remove `skipLogic`** from every stage.
5. **Post-validate** the complete Schema 9 result.

A migrated protocol produces the same route for the same network as it did
under Schema 8, which the migration test suite asserts by running both route
computations over the existing skip-logic fixtures.

Schema 8 remains immutable. Classic applications reject Schema 9 at their
compatibility boundary.

## 11. Missing data, exposure, analytics

- **Exposure ledger (#1536 §6, #1656).** Each route computation records the
  outcome taken at every decision point on the route, every stage's
  availability with its `divertedBy` record, and, at finish, the finish stage
  id and outcome kind. This is what lets retrospective `notAsked` establish
  "bypassed by routing" for a concrete stage rather than inferring it. A
  stage the participant stayed on after it left the route (§7.3) was
  presented, so the ledger records it as asked.
- **Analytics.** Route-change events carry decision point and outcome ids and
  the finish outcome kind; never condition inputs or attribute values.
- **Synthetic generation (#1426).** Generation walks the timeline in route
  order, evaluating each decision point against the network generated so far
  with the same evaluator the runtime uses, so fixtures exercise each outcome
  and never populate stages that the generated route does not reach.
  Deterministic fixtures may pin decision inputs to exercise a chosen path.

## 12. Architect

Architect's timeline becomes a hierarchical graph drawn top to bottom
(decision 14). Each sequence is laid out with the same layered method the
Family Pedigree interface uses, with one rule that is specific to
interviews: **the default path is the spine.** Starting from the sequence's
first item and following each item's default edge (a stage's fall-through, a
group's exit, a decision point's "otherwise") traces the route the interview
takes when nothing diverts it; those items sit on one centre line. Every
item is assigned a layer by longest path from the first item. A decision
point's outcomes open to either side of its own lane, alternating left,
right, left in outcome order, and an item that is not on the spine stays in
the lane of whatever leads to it until it rejoins. An edge that skips layers
gets a placeholder in each skipped layer, so the "otherwise" edge of a
decision point runs straight down the middle between the modules it
bypasses rather than across them, and a skip-this-stage edge passes beside
the stage it skips. Within a layer the spine item is centred on the centre
line and side items pack outward from it, nearest lane first. A group is one
node of its parent's graph whose box contains its own layout with its own
spine, so a group's contents are visibly inside it and move with it. The illustration in §17 shows the intended shape; the rules
are:

- **Stages** are nodes with the document-order number, the label, and the
  interface name. A straight edge joins each stage to whatever follows it.
- **Decision points** are nodes with a diamond marker and the label. Each
  outcome is an outgoing edge labelled with the outcome's name, ordered left
  to right in evaluation order, with the "otherwise" edge last; hovering or
  selecting the decision point reveals each outcome's condition in words.
  Two outcomes that share a target draw as two labelled edges into the same
  node.
- **Groups** are boxes with the group label and item count in a header, the
  group's own layout inside, and the exit at the bottom edge. A box can be
  collapsed to a single node. Dragging a box drags its contents; an edge
  leaving the box bottom is the group exit, labelled "exit" when it links
  past the next item.
- **Finish stages** are terminal nodes with a stop marker and the outcome
  kind as a badge; no edge leaves them.
- **Insert points** appear on every edge and at the start and end of every
  group, offering stage, group, and decision point. Dropping an item on an
  edge inserts it into that edge's sequence at that position.
- **Selection actions:** "Group selected" wraps a contiguous run of siblings
  in a new group; "Ungroup" splices a group's contents into its parent and
  drops its exit link; "Skip this stage when…" inserts a decision point before
  the selected stage with one outcome targeting the item after it (the
  migration shape); "Duplicate" follows #1523 (fresh ids, internal links
  remapped, external links unchanged).
- **Reorder and delete guards** generalise today's skip-destination guards to
  links: a move that would make a link point backward, out of its sequence,
  or into a group is refused with the existing warning style, naming both
  ends; deleting a link target is blocked until the links naming it are
  changed, naming each dependent by position and label. Moving a group never
  invalidates the links inside it.
- **Decision point editor:** label; the ordered outcome list with reorder,
  each outcome having a label, the shared condition builder from #1537's
  Architect issue restricted to interview-level sources, and a target picker
  that lists only valid targets ("Continue to next item", then each later
  sibling by document number and label); the "otherwise" target picker.
- **Group editor:** localized label, description, exit target picker.
- **Finish stage editor:** localized label, title, and content through the
  rich text editor with the #1522 dynamic-value picker; outcome kind.
- **Printable summary and codebook documentation** render the tree, each
  decision point's outcomes in words, link targets by number and label,
  group boundaries, and finish outcomes.
- **Protocol builder (#1548).** The shared skip-logic Section is not built.
  The rule-editing primitives, network-filter Section, and automatic naming
  in that issue remain; the decision point, group, and finish stage editors
  are added to the package's scope so Architect and Studio share them.

## 13. Templates

#1282 gains a template kind, **stage group**: a group subtree plus the
codebook entries its stages and conditions reference. Insertion is
copy-on-insert as already decided there; the mapping step binds every
attribute referenced by a stage or a decision point condition in the group to
the destination codebook. Because links inside a group only name items inside
it, an inserted group's links are valid without rewriting beyond the id
freshening #1523 already requires. Finish stages inside the group travel with
it. Under the sectioned store (#1276) a group template is one section
document, which is the reason groups, not arbitrary runs of stages, are the
shareable unit.

## 14. Consumers and contracts

- `@codaco/protocol-validation`: the timeline item schemas, `FinishSession`
  stage schema, the route walk used by validation, migration steps, and
  framework-free helpers equivalent to `flattenTimeline(timeline)` (document
  order), `computeRoute(timeline, state)`, `collectTimelineLinks(timeline)`,
  and `validateTimelineStructure(timeline)`. No other package implements a
  competing walk.
- `@codaco/interview`: replaces the skip-logic selectors with the shared
  route, removes the synthetic finish stage, renders `FinishSession` from the
  protocol, renders groups in the stage menu, reports the finish stage id and
  outcome kind through the finish handler, and defines `totalSteps` as route
  length. `ProtocolPayload.stages` becomes `timeline`.
- Interviewer, Fresco, Studio: persist the finish outcome kind and finish
  stage id with the session; pass them to exports; Studio surfaces counts per
  outcome kind. Studio's interview record design gains the two fields.
- `@codaco/network-exporters`: outcome kind as session-level metadata in
  every format that carries session fields.
- Architect and `@codaco/protocol-builder`: §12.
- Documentation: new pages for groups, decision points, finish stages, and
  the migration of skip logic; Documentation-lane changeset.
- Completion-time estimate (#1647): the estimate becomes per-route; the
  editor shows the longest route by default.

## 15. Verification

- Schema: item discrimination, non-empty sequences, explicit targets, finish
  outcome kinds, duplicate and missing ids across nested groups.
- Structure: every link rule in §9.2 including targets inside groups, outside
  groups, backward, self, and missing; the every-path-ends-at-finish rule
  with finish stages at the top level, inside groups, and mid-sequence with
  a skipping link; unreachable items; the every-path dominance rule for
  source-stage references; depth and size guards; malformed imported input.
- Route walk: first-match outcome order; `next` and `item` targets; group
  entry by fall-through and by link; group exits of both kinds including a
  last-in-parent group; nested exits; finish stages ending the route
  mid-timeline; increasing document order; determinism.
- Runtime: continuous re-evaluation on data change; an off-route current
  stage stays mounted and working until the participant navigates, then Next
  goes forward and Back goes backward along the route, with the route
  recomputed after before-navigation handlers; Back across decision points;
  forced navigation to an off-route
  stage from the stage menu with the diverting label; stage menu grouping;
  progress and `totalSteps` over the route; numeric step resume onto an
  off-route stage; preview from-start versus stage-scoped.
- Finish stage: text rendering with localization and dynamic attributes;
  flush-before-finish preserved; outcome kind delivered to the host and
  persisted on Interviewer, Fresco, and Studio; exports carry it.
- Migration: every Schema 8 skip-logic fixture produces the same route under
  both walks; SHOW and SKIP; stage, finish, and absent destinations;
  chained destinations; overlapping ranges; last-stage skip; deterministic
  ids; idempotence at the v9 boundary; post-validation.
- Architect: timeline rendering of all three kinds; group drag with contents;
  reorder and delete guards on links; group, ungroup, skip-when, duplicate;
  the three editors; printable summary; protocol-builder parity tests.
- Exposure ledger and synthetic generation record and exercise outcomes.

## 16. Example protocol.json (Schema 9, this feature only)

The example is a screening interview with two exclusive modules. Other
Schema 9 changes (the attribute registry, localization of every string,
missing-data codes, form items) are elided with `…` where they do not bear on
routing. Condition node shapes follow #1537 §3 and are illustrative until
#1661 fixes the final property names.

```json
{
  "schemaVersion": 9,
  "name": "Substance use and support networks",
  "codebook": { "…": "…" },
  "timeline": [
    {
      "kind": "stage",
      "id": "a1b2c3d4-0001-4000-8000-000000000001",
      "type": "Information",
      "label": { "en": "Introduction" },
      "title": { "en": "Welcome" },
      "items": ["…"]
    },
    {
      "kind": "stage",
      "id": "a1b2c3d4-0002-4000-8000-000000000002",
      "type": "EgoForm",
      "label": { "en": "About you" },
      "form": { "…": "writes ego.age and ego.substanceUse" }
    },
    {
      "kind": "decision",
      "id": "a1b2c3d4-0003-4000-8000-000000000003",
      "label": "Eligibility check",
      "outcomes": [
        {
          "id": "a1b2c3d4-0004-4000-8000-000000000004",
          "label": "Under 18",
          "condition": {
            "id": "a1b2c3d4-0005-4000-8000-000000000005",
            "kind": "comparison",
            "source": { "kind": "attribute", "role": "ego", "attributeId": "age" },
            "operator": "LESS_THAN",
            "value": 18
          },
          "target": { "kind": "item", "itemId": "a1b2c3d4-0011-4000-8000-000000000011" }
        }
      ],
      "otherwise": { "kind": "next" }
    },
    {
      "kind": "stage",
      "id": "a1b2c3d4-0006-4000-8000-000000000006",
      "type": "NameGeneratorQuickAdd",
      "label": { "en": "People you know" },
      "…": "…"
    },
    {
      "kind": "stage",
      "id": "a1b2c3d4-0007-4000-8000-000000000007",
      "type": "Sociogram",
      "label": { "en": "Relationships" },
      "…": "…"
    },
    {
      "kind": "decision",
      "id": "a1b2c3d4-0008-4000-8000-000000000008",
      "label": "Substance use",
      "outcomes": [
        {
          "id": "a1b2c3d4-0009-4000-8000-000000000009",
          "label": "Uses drugs",
          "condition": {
            "id": "a1b2c3d4-000a-4000-8000-00000000000a",
            "kind": "comparison",
            "source": { "kind": "attribute", "role": "ego", "attributeId": "substanceUse" },
            "operator": "INCLUDES",
            "value": ["drugs"]
          },
          "target": { "kind": "item", "itemId": "b1b2c3d4-0001-4000-8000-000000000001" }
        },
        {
          "id": "a1b2c3d4-000b-4000-8000-00000000000b",
          "label": "Drinks alcohol",
          "condition": {
            "id": "a1b2c3d4-000c-4000-8000-00000000000c",
            "kind": "and",
            "conditions": [
              {
                "id": "a1b2c3d4-000d-4000-8000-00000000000d",
                "kind": "comparison",
                "source": { "kind": "attribute", "role": "ego", "attributeId": "substanceUse" },
                "operator": "INCLUDES",
                "value": ["alcohol"]
              },
              {
                "id": "a1b2c3d4-000e-4000-8000-00000000000e",
                "kind": "comparison",
                "source": {
                  "kind": "networkQuery",
                  "query": {
                    "join": "AND",
                    "rules": [
                      {
                        "id": "a1b2c3d4-000f-4000-8000-00000000000f",
                        "type": "node",
                        "options": { "type": "person", "operator": "EXISTS" }
                      }
                    ]
                  }
                },
                "operator": "MATCHES"
              }
            ]
          },
          "target": { "kind": "item", "itemId": "c1b2c3d4-0001-4000-8000-000000000001" }
        }
      ],
      "otherwise": { "kind": "item", "itemId": "a1b2c3d4-0010-4000-8000-000000000010" }
    },
    {
      "kind": "group",
      "id": "b1b2c3d4-0001-4000-8000-000000000001",
      "label": { "en": "Drug use module" },
      "description": "Shown only to participants who report drug use.",
      "items": [
        {
          "kind": "stage",
          "id": "b1b2c3d4-0002-4000-8000-000000000002",
          "type": "CategoricalBin",
          "label": { "en": "Substances used" },
          "…": "…"
        },
        {
          "kind": "stage",
          "id": "b1b2c3d4-0003-4000-8000-000000000003",
          "type": "Sociogram",
          "label": { "en": "Used with" },
          "…": "…"
        },
        {
          "kind": "stage",
          "id": "b1b2c3d4-0004-4000-8000-000000000004",
          "type": "EgoForm",
          "label": { "en": "Frequency" },
          "…": "…"
        }
      ],
      "exit": { "kind": "item", "itemId": "a1b2c3d4-0010-4000-8000-000000000010" }
    },
    {
      "kind": "group",
      "id": "c1b2c3d4-0001-4000-8000-000000000001",
      "label": { "en": "Alcohol module" },
      "items": [
        {
          "kind": "stage",
          "id": "c1b2c3d4-0002-4000-8000-000000000002",
          "type": "EgoForm",
          "label": { "en": "Drinking patterns" },
          "…": "…"
        }
      ],
      "exit": { "kind": "next" }
    },
    {
      "kind": "stage",
      "id": "a1b2c3d4-0010-4000-8000-000000000010",
      "type": "EgoForm",
      "label": { "en": "Closing questions" },
      "…": "…"
    },
    {
      "kind": "stage",
      "id": "a1b2c3d4-0012-4000-8000-000000000012",
      "type": "FinishSession",
      "label": { "en": "Thank you" },
      "title": { "en": "Thank you, {{ dynamic_attribute: ego.firstName }}" },
      "content": {
        "en": "You have reached the end of the interview. If you are satisfied with the information you have entered, you may finish the interview now."
      },
      "outcome": "completed"
    },
    {
      "kind": "stage",
      "id": "a1b2c3d4-0011-4000-8000-000000000011",
      "type": "FinishSession",
      "label": { "en": "Not eligible" },
      "title": { "en": "Thank you for your interest" },
      "content": {
        "en": "This study is open to adults aged 18 and over, so we are unable to continue the interview. Thank you for your time."
      },
      "outcome": "ineligible"
    }
  ]
}
```

Reading the routes:

- Everyone sees Introduction and About you. Under 18 jumps to the Not
  eligible finish stage (outcome `ineligible`) and the interview ends there.
  The "Thank you" finish stage before it is never reached on that path, and
  the "Not eligible" stage is reachable only by the link, which rule 9.4
  accepts.
- Drug users enter the Drug use module; its exit links to Closing questions,
  skipping the Alcohol module. Drinkers who have named at least one person
  enter the Alcohol module, whose exit is `next`, which is Closing questions.
  Everyone else jumps straight to Closing questions.
- Every path ends at a finish stage: "Thank you" by falling through, "Not
  eligible" by link.

Migration of a Schema 8 stage with `skipLogic: { action: 'SKIP', filter,
destination: { type: 'stage', stageId: X } }` yields exactly one decision
point of the same shape as "Eligibility check" above, placed before the
stage, with `otherwise: { kind: 'next' }`.

## 17. Timeline illustration

The Architect timeline for the example above, laid out as §12 describes.
The default path is the centre line: Introduction, About you, the
eligibility check's "otherwise", People you know, Relationships, the
substance-use check's "otherwise" running straight down between the two
modules, Closing questions, Thank you. Outcomes open to either side: "Under
18" leaves to the left and ends at "Not eligible"; the Drug use module sits
left and the Alcohol module right, and both rejoin at Closing questions.
Stages carry their document-order number; groups are boxes containing their
own layout. The interactive mock-up that accompanies this spec renders the
same protocol.

```text
                          ┌───────────────────────┐
                          │ 1  Introduction       │
                          └───────────┬───────────┘
                          ┌───────────┴───────────┐
                          │ 2  About you          │
                          └───────────┬───────────┘
                          ┌───────────┴───────────┐
                          │ ◆  Eligibility check  │
                          └──────┬────────┬───────┘
                       Under 18 ╱         │ otherwise
      ┌────────────────────────┴┐   ┌─────┴─────────────────┐
      │ ■ 11  Not eligible      │   │ 3  People you know    │
      │       Finish · ineligible│   └───────────┬───────────┘
      └─────────────────────────┘   ┌───────────┴───────────┐
                                    │ 4  Relationships      │
                                    └───────────┬───────────┘
                                    ┌───────────┴───────────┐
                                    │ ◆  Substance use      │
                                    └───┬───────┬───────┬───┘
                           Uses drugs ╱         │        ╲ Drinks alcohol
        ┌────────────────────────────┴┐         │       ┌─┴──────────────────────┐
        │ ▣ Drug use module           │         │       │ ▣ Alcohol module       │
        │ ┌─────────────────────────┐ │         │       │ ┌────────────────────┐ │
        │ │ 5  Substances used      │ │         │       │ │ 8  Drinking        │ │
        │ └───────────┬─────────────┘ │  other- │       │ │    patterns        │ │
        │ ┌───────────┴─────────────┐ │  wise   │       │ └─────────┬──────────┘ │
        │ │ 6  Used with            │ │         │       │  Exit → continue       │
        │ └───────────┬─────────────┘ │         │       └───────────┬────────────┘
        │ ┌───────────┴─────────────┐ │         │                   │
        │ │ 7  Frequency            │ │         │                   │
        │ └───────────┬─────────────┘ │         │                   │
        │  Exit → 9 Closing questions │         │                   │
        └───────────────┬─────────────┘         │                   │
                        ╲ exit                  │                  ╱
                                    ┌───────────┴───────────┐
                                    │ 9  Closing questions  │
                                    └───────────┬───────────┘
                                    ┌───────────┴───────────┐
                                    │ ■ 10  Thank you       │
                                    │       Finish · completed│
                                    └───────────────────────┘
```

## 18. Sequencing

This feature lands inside the combined Schema 9 tree on its integration
branch (#1514). It depends on #1523 for ids, #1661 for the condition AST,
#1475 for `LocalizedString`, #1522 for dynamic attributes in finish text, and
#1536 / #1656 for the exposure ledger. After approval this document is
converted into an epic under #1514 with sub-issues for: schema, validation,
and migration; the interview runtime; Architect and the protocol builder;
Interviewer, Fresco, and Studio finish-outcome persistence; exporters;
documentation; and the #1282 and #1548 rescopes.
