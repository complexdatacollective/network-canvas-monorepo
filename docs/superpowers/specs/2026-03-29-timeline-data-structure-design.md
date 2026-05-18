# Timeline Data Structure Design

## Overview

Replace the flat `stages` array in Network Canvas protocol files with a hierarchical directed graph called a "timeline". The timeline represents various routes through an interview, where the path taken is determined by interview network data. This is a new protocol schema version (v9).

## Data Structure

### Timeline Object

The timeline replaces `stages` at the protocol root:

```json
{
  "timeline": {
    "start": "<entity-id>",
    "entities": [ ...entities ]
  },
  "codebook": { ... },
  "assetManifest": { ... }
}
```

- `start`: ID of the first entity in the interview
- `entities`: ordered array of top-level entities. Array order has no semantic meaning for execution (the graph defines execution order) but serves as a rendering/layout hint

### Entity Types

Three entity types, discriminated by the `type` field:

#### Stage

The basic unit of the interview. Represents an individual question or task that mutates the interview network.

```json
{
  "id": "uuid",
  "type": "Stage",
  "stageType": "EgoForm",
  "label": "Demographics",
  "target": "next-entity-id",
  ...stageSpecificProperties
}
```

- `stageType`: the stage variant (formerly `type` in v8). One of: EgoForm, AlterForm, AlterEdgeForm, NameGenerator, NameGeneratorQuickAdd, NameGeneratorRoster, Sociogram, DyadCensus, TieStrengthCensus, OrdinalBin, CategoricalBin, Narrative, Information, Anonymisation, OneToManyDyadCensus, FamilyPedigree, Geospatial, FinishInterview
- `target`: ID of the next entity. Omitted on FinishInterview stages (terminal nodes)
- `label`: human-readable stage name
- All existing stage-specific properties (prompts, forms, filters, codebook references, etc.) are unchanged
- `skipLogic` is removed (replaced by Branch entities)
- Can have multiple parents (multiple entities targeting it), but only a single target
- The entity referenced by `timeline.start` has zero parents

#### Collection

A group of entities that are always taken together. Acts as an opaque unit in the graph.

```json
{
  "id": "uuid",
  "type": "Collection",
  "name": "Youth Instrument",
  "children": [ ...entities ]
}
```

- `children`: ordered array of entities (stages, branches, or nested collections)
- No `target` property. The collection's outgoing connection is inherited from the last child's `target`
- No source of its own. External entities target the collection ID, which resolves to the first child
- Non-last children can only target sibling IDs within the same collection
- Last child must target an entity ID outside the collection (or omit target if FinishInterview)

#### Branch

A decision point where the path diverges based on interview network data.

```json
{
  "id": "uuid",
  "type": "Branch",
  "name": "Age Group",
  "slots": [
    {
      "id": "slot-uuid",
      "label": "Under 18",
      "filter": { "join": "AND", "rules": [...] },
      "target": "entity-id"
    },
    {
      "id": "slot-uuid",
      "label": "Everyone Else",
      "default": true,
      "target": "entity-id"
    }
  ]
}
```

- Minimum 2 slots
- Exactly one slot must have `default: true` (no filter required on the default slot)
- Non-default slots use the existing filter schema (same structure as current skip logic filters)
- Slots are evaluated in array order; first matching slot wins; default is taken if none match
- No `target` on the branch itself; each slot has its own target
- Can accept multiple parents

### Key Naming Changes from v8

| v8                            | v9                               | Notes                                  |
| ----------------------------- | -------------------------------- | -------------------------------------- |
| `stage.type` (e.g. "EgoForm") | `stage.stageType`                | `type` is now the entity discriminator |
| n/a                           | `entity.type`                    | "Stage", "Collection", or "Branch"     |
| `stage.skipLogic`             | removed                          | Replaced by Branch entities            |
| `stage.label`                 | `stage.label`                    | Unchanged for stages                   |
| n/a                           | `collection.name`, `branch.name` | New entity naming                      |
| Auto-injected finish screen   | Explicit FinishInterview stage   | Must be present in timeline            |

## Validation Rules

### ID Uniqueness

All entity IDs must be globally unique across the entire timeline, including nested children and slot IDs. Uses the same duplicate-checking pattern as current `findDuplicateId`.

### Target Reference Validity

- Every `target` must reference an existing entity ID (or collection ID) within the timeline
- Targets must not reference themselves (no self-loops)
- FinishInterview stages must not have a `target`

### Graph Integrity

- **No cycles**: the timeline is a DAG. Every path from `start` must eventually terminate
- **No orphans**: every entity except the start entity must be reachable from at least one other entity's target
- **All paths terminate at FinishInterview**: following any path from `start` through all branch slot possibilities must reach a FinishInterview stage
- **No dead ends**: non-FinishInterview entities must have valid outgoing connections

### Collection Constraints

- Must have at least one child
- Non-last children can only target sibling IDs within the same collection
- Last child must target an entity ID outside the collection (or omit target if FinishInterview)
- Last child must not be a Branch (branches have multiple exits, violating the single-exit constraint). It can be a Stage or a nested Collection (which has its own single exit)
- First child cannot be targeted by siblings (entry point only reachable from outside)

### Branch Constraints

- Minimum 2 slots
- Exactly one slot with `default: true`
- Non-default slots must have a `filter`
- All slot targets must be valid entity references
- Slot IDs must be unique within the branch

### Codebook Cross-References

Same as v8: stage subjects, form field variables, prompt variables, and filter rule attributes must exist in the codebook. Branch slot filters are validated using the same rules as current skip logic filters.

### Start Reference

- `timeline.start` must reference an existing top-level entity ID
- The referenced entity must not be a FinishInterview stage

## Schema Migration (v8 to v9)

### Simple Case (no skip logic)

Linear chain: each stage targets the next. A FinishInterview stage is appended as the terminal node.

- `stage.type` renamed to `stage.stageType`
- `type: "Stage"` added to all entities
- `stage.target` set to the next stage's ID
- `timeline.start` set to the first stage's ID
- The previously auto-injected finish screen becomes an explicit FinishInterview stage

### Stages With Skip Logic

Skip logic (`action: "SHOW" | "SKIP"` with filter) translates to a branch inserted before the stage:

- **SKIP**: Branch with 2 slots. Condition match targets the stage _after_ the skipped one (skip path). Default targets the stage itself (proceed path).
- **SHOW**: Branch with 2 slots. Condition match targets the stage (show path). Default targets the stage after (skip path).

The branch gets a generated name based on the stage label (e.g., "Skip: Demographics").

### Migration Example

v8:

```json
{
  "stages": [
    { "id": "s1", "type": "Information", "label": "Welcome" },
    {
      "id": "s2",
      "type": "EgoForm",
      "label": "Demographics",
      "skipLogic": {
        "action": "SKIP",
        "filter": { "join": "AND", "rules": [] }
      }
    },
    { "id": "s3", "type": "Information", "label": "Thank You" }
  ]
}
```

v9:

```json
{
  "timeline": {
    "start": "s1",
    "entities": [
      {
        "id": "s1",
        "type": "Stage",
        "stageType": "Information",
        "label": "Welcome",
        "target": "branch-generated"
      },
      {
        "id": "branch-generated",
        "type": "Branch",
        "name": "Skip: Demographics",
        "slots": [
          {
            "id": "slot-1",
            "filter": { "join": "AND", "rules": [] },
            "label": "Skip",
            "target": "s3-finish"
          },
          {
            "id": "slot-2",
            "default": true,
            "label": "Default",
            "target": "s2"
          }
        ]
      },
      {
        "id": "s2",
        "type": "Stage",
        "stageType": "EgoForm",
        "label": "Demographics",
        "target": "s3-finish"
      },
      {
        "id": "s3-finish",
        "type": "Stage",
        "stageType": "FinishInterview",
        "label": "Thank You"
      }
    ]
  }
}
```

## UI: Timeline Component

### Visual Representation

The current vertical timeline evolves into a directed graph layout, rendered top-to-bottom:

- **Stages**: render as current stage cards (image, number, label)
- **Collections**: render as a visually grouped container (border/background) with children inside
- **Branches**: render as a diamond/decision node with lines fanning out to each slot's target
- **Convergence points**: multiple incoming lines merge visually into one entity

### Layout Algorithm

Layout is deterministic from the timeline structure:

- Traverse the graph depth-first from `timeline.start`
- Each entity occupies a row. Branches split the layout into parallel columns
- When paths converge, the target entity is placed in the row after the longest incoming path
- Collections are nested sub-graphs within a containing box
- Slot order (left-to-right) determines column ordering for branch paths

### Drag and Drop

Three distinct drag behaviors:

1. **Reorder within a linear sequence**: dragging a stage between two connected stages in the same path. Rewires `target` references automatically.
2. **Move into/out of collections**: dragging a stage into a collection inserts it into the children array and rewires targets. Dragging out reverses this. Collection constraints enforced (cannot leave a collection empty).
3. **Reorder branch slots**: dragging slots within a branch reorders evaluation priority. Default slot always remains last.

Drop targets that would create invalid states (cycles, broken paths) are disabled during drag.

### Adding Entities

- **Add Stage**: insert points appear between connected entities (similar to current "+" buttons). Opens existing stage type picker. New stage is wired into the graph.
- **Add Branch**: available at any insert point. Creates a branch with 2 default slots, both initially targeting the same next entity.
- **Add Collection**: wrap selected stages into a collection, or insert an empty collection.
- **Add FinishInterview**: available at terminal insert points (end of a branch path).

### Removing Entities

- **Delete Stage**: parent's target rewires to the deleted stage's target (bridges the gap). Collection constraints re-validated.
- **Delete Branch**: collapses to linear path using the default slot's target. Unreachable paths flagged/cleaned up.
- **Delete Collection**: unwraps children into the parent scope, preserving internal wiring.

### Stage Editor Integration

Clicking a stage navigates to the stage editor (same as current behavior). The editor is unchanged; only timeline navigation and graph wiring are new.

## Complete Example

A protocol with a branch based on participant age, where youth and adults get different instruments and different finish screens:

```json
{
  "timeline": {
    "start": "welcome",
    "entities": [
      {
        "id": "welcome",
        "type": "Stage",
        "stageType": "Information",
        "label": "Welcome",
        "target": "name-gen"
      },
      {
        "id": "name-gen",
        "type": "Stage",
        "stageType": "NameGenerator",
        "label": "Name Generator",
        "target": "age-branch"
      },
      {
        "id": "age-branch",
        "type": "Branch",
        "name": "Age Group",
        "slots": [
          {
            "id": "slot-youth",
            "label": "Under 18",
            "filter": {
              "join": "AND",
              "rules": [
                {
                  "id": "rule-1",
                  "type": "ego",
                  "options": {
                    "attribute": "age-variable-id",
                    "operator": "LESS_THAN",
                    "value": 18
                  }
                }
              ]
            },
            "target": "youth-collection"
          },
          {
            "id": "slot-adult",
            "label": "Adult (default)",
            "default": true,
            "target": "adult-sociogram"
          }
        ]
      },
      {
        "id": "youth-collection",
        "type": "Collection",
        "name": "Youth Instrument",
        "children": [
          {
            "id": "youth-form",
            "type": "Stage",
            "stageType": "EgoForm",
            "label": "Youth Demographics",
            "target": "youth-census"
          },
          {
            "id": "youth-census",
            "type": "Stage",
            "stageType": "DyadCensus",
            "label": "Youth Relationships",
            "target": "youth-finish"
          }
        ]
      },
      {
        "id": "youth-finish",
        "type": "Stage",
        "stageType": "FinishInterview",
        "label": "Thank you (Youth)"
      },
      {
        "id": "adult-sociogram",
        "type": "Stage",
        "stageType": "Sociogram",
        "label": "Adult Network Map",
        "target": "adult-finish"
      },
      {
        "id": "adult-finish",
        "type": "Stage",
        "stageType": "FinishInterview",
        "label": "Thank you (Adult)"
      }
    ]
  }
}
```
