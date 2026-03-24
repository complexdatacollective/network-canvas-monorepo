# Node Shape Mapping

Map variable values to node shapes in the codebook, allowing nodes to visually differentiate based on data.

## Overview

Extend `NodeDefinition` in the protocol schema to support:
1. A **default shape** for each node type (circle, square, or diamond)
2. An optional **dynamic shape mapping** that overrides the default based on a variable's value

The mapping lives at the codebook level (not per-stage), consistent with how `color` works today. Unlike `color` (which is a flat string), `shape` is a nested object to accommodate the mapping configuration. This asymmetry is intentional — dynamic color mapping is out of scope.

## Schema Design

### NodeDefinition (updated)

```typescript
const NodeShapes = ["circle", "square", "diamond"] as const;
type NodeShape = typeof NodeShapes[number];

type NodeDefinition = {
  name: string;
  color: NodeColor;
  icon?: string;              // renamed from iconVariant (bundled into this feature since schema 8 is unreleased)
  variables?: Variables;
  shape: {                    // required field — always present, never optional
    default: NodeShape;       // fallback shape
    dynamic?: ShapeMapping;   // optional variable-driven override
  };
};
```

The `shape` field is **required** on all node definitions. The v8 migration adds it to existing protocols. `NodeDefinitionSchema` uses `z.strictObject`, so validation of pre-migration documents will fail if `shape` is absent — the migration is mandatory.

### ShapeMapping (discriminated union)

```typescript
// For categorical, ordinal, boolean variables
type DiscreteShapeMapping = {
  variable: string;           // variable ID within this node type
  type: "discrete";
  map: Array<{
    value: string | number | boolean;
    shape: NodeShape;
  }>;
};

// For number, scalar variables
type BreakpointShapeMapping = {
  variable: string;           // variable ID within this node type
  type: "breakpoints";
  thresholds: Array<{ value: number; shape: NodeShape }>;
  // Values below the first threshold use shape.default
  // Sorted ascending, no duplicates
};

type ShapeMapping = DiscreteShapeMapping | BreakpointShapeMapping;
```

The discrete `map` uses an array of `{ value, shape }` pairs rather than a `Record` to avoid JSON key serialization issues (JSON object keys are always strings, but option values can be numbers or booleans). The array format also preserves ordering for UI rendering and is consistent with how variable `options` are already stored.

### Examples

**Categorical mapping:**
```json
{
  "name": "Person",
  "color": "node-color-seq-1",
  "icon": "add-a-person",
  "shape": {
    "default": "circle",
    "dynamic": {
      "variable": "role_var_id",
      "type": "discrete",
      "map": [
        { "value": "person", "shape": "circle" },
        { "value": "place", "shape": "square" },
        { "value": "org", "shape": "diamond" },
        { "value": "club", "shape": "square" }
      ]
    }
  }
}
```

**Breakpoint mapping:**
```json
{
  "name": "Person",
  "color": "node-color-seq-2",
  "shape": {
    "default": "circle",
    "dynamic": {
      "variable": "age_var_id",
      "type": "breakpoints",
      "thresholds": [
        { "value": 18, "shape": "square" },
        { "value": 65, "shape": "diamond" }
      ]
    }
  }
}
```

This reads as: `<18` → circle (default), `≥18` → square, `≥65` → diamond.

### Eligible Variable Types

| Variable Type | Mapping Type | Notes |
|---|---|---|
| categorical | `discrete` | Maps option values to shapes |
| ordinal | `discrete` | Maps option values to shapes |
| boolean (Boolean component) | `discrete` | Maps true/false to shapes; uses the variable's `options` array for labels |
| boolean (Toggle component) | `discrete` | Maps true/false to shapes; uses hardcoded "True"/"False" labels (no options array) |
| number | `breakpoints` | User-defined thresholds |
| scalar | `breakpoints` | User-defined thresholds (0–1 range) |
| text | — | Not eligible |
| datetime | — | Not eligible |
| layout | — | Not eligible |
| location | — | Not eligible |

Both boolean variable variants (Boolean and Toggle) are eligible. The difference is only in the UI: Boolean variables have an `options` array with labels, while Toggle variables do not. For Toggle booleans, the DiscreteMapping UI uses hardcoded "True"/"False" labels. The schema-level mapping is identical for both (`map` entries with boolean `value` fields).

### Validation Rules

- `shape` is a required field on `NodeDefinition`
- `shape.default` must be a valid `NodeShape`
- `dynamic.variable` must reference a variable ID that exists in this node type's `variables`
- The referenced variable must be an eligible type
- `type` must match the variable kind: discrete types → `"discrete"`, continuous types → `"breakpoints"`
- For `discrete`: each `value` in the `map` array must be unique
- For `breakpoints`: thresholds must be sorted ascending with no duplicate values
- For `breakpoints`: minimum 1 threshold, maximum 2 thresholds (enforced at schema level — 3 shapes means at most 3 buckets)
- Unmapped discrete values fall back to `shape.default` — warn (don't error)

### Fallback Behavior

- Nodes without a `dynamic` mapping always use `shape.default`
- Nodes with a `dynamic` mapping use it when the variable has a value that matches a mapping entry
- For discrete mappings: unmapped values fall back to `shape.default`
- For breakpoint mappings: values below the first threshold fall back to `shape.default`
- If the variable has no value (null/undefined), fall back to `shape.default`

## Schema 8 Migration

Since schema 8 is not yet released, these changes are added to the existing v8 migration:

1. Rename `iconVariant` → `icon` on all node definitions
2. Add `shape: { default: "circle" }` to all existing node definitions

The `iconVariant` → `icon` rename is bundled into this feature since schema 8 is unreleased. This rename affects all consumers of `NodeDefinition`, including the architect app (which references `iconVariant` in multiple files). All references must be updated as part of implementation.

## UI Design: TypeEditor Shape Section

### Component Architecture

```
TypeEditor.tsx
├── Section: "Name"           (existing)
├── Section: "Color"          (existing)
├── Section: "Shape"          (new, node only)
│   ├── ShapePicker           — radio group for default shape
│   ├── Toggle                — enable/disable dynamic mapping
│   └── ShapeVariableMapping  — conditional on toggle
│       ├── Select            — variable picker (filtered to eligible types)
│       ├── DiscreteMapping   — if categorical/ordinal/boolean
│       └── BreakpointMapping — if number/scalar
└── Section: "Icon"           (existing, renamed field)
```

### New Components

**ShapePicker** — A radio group rendering circle, square, and diamond as visual buttons (similar to ColorPicker but with shape icons). Selected state shown via border highlight. Each shape rendered as a small SVG/CSS preview.

**ShapeVariableMapping** — Container that renders when the toggle is on. Contains:
- A `Select` dropdown filtered to eligible variable types from this node type's variables
- Conditionally renders DiscreteMapping or BreakpointMapping based on the selected variable's type

**DiscreteMapping** — A table where each row shows:
- The option label (from the variable's `options` array, or hardcoded "True"/"False" for Toggle booleans)
- An inline ShapePicker (smaller variant) for assigning a shape
- Unmapped values shown with a muted style and warning indicator

**BreakpointMapping** — An editable list where:
- First row is read-only: "Below first threshold → uses default shape" with a preview of the default
- Each threshold row shows: `≥` prefix, a number input for the value, `→` arrow, inline ShapePicker, and a delete button
- "Add threshold" button at the bottom (limited to 2, since there are only 3 shapes)
- Thresholds auto-sort ascending on blur

### Interaction Flow

1. User picks a **default shape** (circle preselected for new node types)
2. User toggles **"Map variable to shape"** on
3. Variable dropdown appears, filtered to eligible types only
4. On variable selection, the appropriate mapping UI renders:
   - **Discrete**: table of option values, each with inline shape picker
   - **Breakpoints**: editable threshold list with "add threshold" button
5. Unmapped discrete values show a warning but don't block saving
6. If the selected variable is later deleted from the codebook, the dynamic mapping is cleared
7. Changing the selected variable resets the mapping

### Variable Option Changes After Mapping

When a categorical/ordinal variable's options are modified after a shape mapping is configured:
- **Option added**: New option appears in the mapping table with no shape assigned (unmapped, uses default). Warning shown.
- **Option removed**: The corresponding entry is removed from the `map` array. No orphan data.
- **Option value changed**: Treated as a remove + add (old mapping lost, new value unmapped).

This is handled reactively in the UI — the DiscreteMapping component derives its rows from the current variable options and merges with the existing `map` entries by value.

### Constraints

- Maximum 3 shapes available, so breakpoint mappings are limited to at most 2 thresholds (3 buckets including default)
- The variable dropdown only shows variables that belong to this node type
- Boolean variables always show exactly 2 rows (true/false) in discrete mapping
