# Family Pedigree Stage Editor Design

## Summary

Replace the `FamilyTreeCensus` stage editor in architect-vite with a new `FamilyPedigree` stage editor that matches the restructured protocol validation schema. The new schema reorganizes flat top-level fields into `nodeConfig` and `edgeConfig` objects, replaces the scaffolding/name-generation two-step flow with a single `censusPrompt`, and generalizes disease nomination prompts into generic `nominationPrompts`.

## Schema Reference

The new `FamilyPedigree` stage schema (`packages/protocol-validation/src/schemas/8/stages/family-pedigree.ts`):

```typescript
{
  // Fields from baseStageSchema (id, label, interviewScript, skipLogic)
  // are handled by the StageEditor shell and the reused SkipLogic/InterviewScript sections.
  type: "FamilyPedigree",
  nodeConfig: {
    type: string,                    // node type ID from codebook
    nodeLabelVariable: string,        // text variable storing the node's display label
    egoVariable: string,             // boolean variable marking the ego node
    biologicalSexVariable: string,   // categorical (male/female/intersex/unknown)
    relationshipVariable: string,    // text variable storing relationship to ego
    form: FormField[],               // array of { variable, prompt }
  },
  edgeConfig: {
    type: string,                    // edge type ID from codebook
    relationshipTypeVariable: string, // categorical (parent/partner)
    isActiveVariable: string,        // boolean
    isGestationalCarrierVariable: string, // boolean
  },
  censusPrompt: string,              // rich text prompt for family building phase
  nominationPrompts?: Array<{        // optional attribute nomination steps
    id: string,
    text: string,
    variable: string,                // boolean node variable
  }>,
}
```

## Editor Section Structure

The stage editor renders sections in this order:

### 1. Node Configuration

A single `<Section title="Node Configuration">` containing four sub-parts:

**Node Type Picker**
- `EntitySelectField` for selecting the node type
- Maps to `nodeConfig.type`
- Same pattern as the existing `NodeType` section but rendered inline

**Variable Pickers** (disabled until node type is selected)
- **Node Label Variable**: `VariablePicker` filtered to text variables on the selected node type. Maps to `nodeConfig.nodeLabelVariable`. Supports inline variable creation via `NewVariableWindow` with `type: "text"`.
- **Ego Variable**: `VariablePicker` filtered to boolean variables on the selected node type. Maps to `nodeConfig.egoVariable`. Supports inline variable creation via `NewVariableWindow` with `type: "boolean"`.
- **Biological Sex Variable**: `VariablePicker` filtered to categorical variables whose options match `[{ value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "intersex", label: "Intersex" }, { value: "unknown", label: "Unknown" }]` using `optionsMatch`. Maps to `nodeConfig.biologicalSexVariable`. Supports inline variable creation with locked options.
- **Relationship Variable**: `VariablePicker` filtered to text variables on the selected node type. Maps to `nodeConfig.relationshipVariable`. Supports inline variable creation via `NewVariableWindow` with `type: "text"`.

Uses the same `VariableRow` layout pattern as the old `FamilyTreeVariables` component (label + description on the left, picker on the right).

**Form Fields** (nested sub-section)
- `EditableList` using the existing `FieldFields` (edit component) and `FieldPreview` (preview component) from `sections/Form/`
- Pointed at field name `nodeConfig.form`
- Uses the same `itemSelector` and `normalizeField` from `sections/Form/helpers`
- Implements its own `handleChangeFields` logic (adapted from `withFormHandlers`) since the field path differs from the standard `form.fields` convention
- No form title field
- Disabled until node type is selected

### 2. Edge Configuration

A single `<Section title="Edge Configuration">` containing:

**Edge Type Picker**
- `EntitySelectField` for selecting the edge type
- Maps to `edgeConfig.type`
- Same pattern as `FamilyTreeEdgeType`

**Variable Pickers** (disabled until edge type is selected)
- **Relationship Type Variable**: `VariablePicker` filtered to categorical variables whose options match `[{ value: "parent", label: "Parent" }, { value: "partner", label: "Partner" }]` using the `optionsMatch` utility from `~/utils/variables`. Maps to `edgeConfig.relationshipTypeVariable`. Supports inline variable creation with locked options.
- **Is Active Variable**: `VariablePicker` filtered to boolean variables on the selected edge type. Maps to `edgeConfig.isActiveVariable`. Supports inline variable creation with `type: "boolean"`. This is a new field with no predecessor in the old FamilyTreeCensus.
- **Gestational Carrier Variable**: `VariablePicker` filtered to boolean variables on the selected edge type. Maps to `edgeConfig.isGestationalCarrierVariable`. Supports inline variable creation with `type: "boolean"`. This is a new field with no predecessor in the old FamilyTreeCensus.

### 3. Census Prompt

A `<Section title="Census Prompt">` containing:
- Single `ValidatedField` with `RichText` component
- Maps to `censusPrompt`
- Required validation

### 4. Nomination Prompts

A `<Section title="Nomination Prompts" toggleable>` containing:
- `EditableList` pointed at `nominationPrompts`
- Each prompt has `{ id, text, variable }`

**Preview Component**: Shows prompt text (rendered as markdown) and a badge displaying the selected variable name and type. Same pattern as `DiseasePromptPreview`.

**Edit Component**: Contains:
- `PromptText` component for the text field
- `VariablePicker` filtered to **boolean variables only** on the selected node type
- Supports inline variable creation with `type: "boolean"`

**Toggle Behavior**: When toggling off, shows a confirmation dialog warning that prompts will be cleared. On confirm, dispatches `change(form, "nominationPrompts", null)`. Same pattern as `DiseaseNominationPrompts`.

### 5. Skip Logic (existing, reused as-is)

### 6. Interview Script (existing, reused as-is)

## File Changes

### New Files

All in `apps/architect-vite/src/components/sections/FamilyPedigree/`:

| File | Purpose |
|------|---------|
| `NodeConfiguration.tsx` | Node type, ego/relationship variables, form fields |
| `EdgeConfiguration.tsx` | Edge type, relationship type/active/gestational carrier variables |
| `CensusPrompt.tsx` | Rich text prompt field |
| `NominationPrompts.tsx` | Toggleable editable list of nomination prompts |
| `NominationPromptFields.tsx` | Edit component for individual nomination prompts |
| `NominationPromptPreview.tsx` | Preview component for individual nomination prompts |

### Modified Files

| File | Change |
|------|--------|
| `apps/architect-vite/src/components/StageEditor/Interfaces.tsx` | Remove `FamilyTreeCensus` entry, add `FamilyPedigree` entry with new sections. Update imports. |
| `apps/architect-vite/src/components/Screens/NewStageScreen/interfaceOptions.ts` | Replace `FamilyTreeCensus` with `FamilyPedigree` in `INTERFACE_TYPE_NAMES` and `INTERFACE_TYPES`. Update title, description, keywords. |
| `apps/architect-vite/src/components/sections/index.tsx` | Remove FamilyTreeCensus exports only. New FamilyPedigree components are imported directly in Interfaces.tsx (no barrel re-exports). |

### Removed Files

All files in `apps/architect-vite/src/components/sections/FamilyTreeCensus/`:
- `DiseaseNominationPrompts.tsx`
- `DiseasePromptFields.tsx`
- `DiseasePromptPreview.tsx`
- `FamilyTreeEdgeType.tsx`
- `FamilyTreeVariables.tsx`
- `NameGenerationStep.tsx`
- `ScaffoldingStep.tsx`
- `index.tsx`

## Notes on FamilyTreeCensus Removal

The following fields from the old `FamilyTreeCensus` schema are intentionally removed in `FamilyPedigree` and have no counterparts in the new editor:
- `egoSexVariable` and `nodeSexVariable` — sex variables are no longer part of the stage configuration
- `scaffoldingStep.showQuickStartModal` — the quick start modal toggle is removed
- `nameGenerationStep.text` and `nameGenerationStep.form.title` — replaced by the simpler `nodeConfig.form` array and `censusPrompt`

The `Interfaces.tsx` and `interfaceOptions.ts` changes must happen simultaneously with the schema changes, since `FamilyTreeCensus` is already removed from the validation schema and `FamilyPedigree` is now a member of the `StageType` union.

## Component Patterns

All section components follow existing patterns:

- Accept `StageEditorSectionProps` (`form`, `stagePath`, `interfaceType`)
- Use `withSubject` HOC to inject `entity` and `type` from the form's subject field
- Use `withDisabledSubjectRequired` HOC to disable when no subject is selected
- Use Redux Form's `formValueSelector` to read form state
- Use Redux Form's `change` action to update form state
- Use `ValidatedField` for fields requiring validation
- Use `IssueAnchor` for validation error anchoring

## Reuse Strategy

| Component | Source | Reuse Method |
|-----------|--------|--------------|
| `FieldFields` | `sections/Form/FieldFields` | Import directly into NodeConfiguration |
| `FieldPreview` | `sections/Form/FieldPreview` | Import directly into NodeConfiguration |
| `itemSelector`, `normalizeField` | `sections/Form/helpers` | Import directly into NodeConfiguration |
| `withFormHandlers` | `sections/Form/withFormHandlers` | Reference for implementing adapted `handleChangeFields` in NodeConfiguration (may not be directly reusable due to field path differences) |
| `EntitySelectField` | `sections/fields/EntitySelectField` | Import into NodeConfiguration and EdgeConfiguration |
| `optionsMatch` | `utils/variables` | Import into EdgeConfiguration for filtering categorical variables with locked options |
| `VariablePicker` | `Form/Fields/VariablePicker` | Import into NodeConfiguration, EdgeConfiguration, NominationPromptFields |
| `NewVariableWindow` | `components/NewVariableWindow` | Import into NodeConfiguration, EdgeConfiguration, NominationPromptFields |
| `EditableList` | `components/EditableList` | Import into NodeConfiguration and NominationPrompts |
| `PromptText` | `sections/PromptText` | Import into NominationPromptFields |
| `SkipLogic` | `sections/SkipLogic` | Reuse as-is in Interfaces.tsx |
| `InterviewScript` | `sections/InterviewScript` | Reuse as-is in Interfaces.tsx |

## Variable Type Constraints

| Variable | Entity | Type | Locked Options |
|----------|--------|------|----------------|
| `nodeConfig.nodeLabelVariable` | node | text | none |
| `nodeConfig.egoVariable` | node | boolean | none |
| `nodeConfig.biologicalSexVariable` | node | categorical | `[{ value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "intersex", label: "Intersex" }, { value: "unknown", label: "Unknown" }]` |
| `nodeConfig.relationshipVariable` | node | text | none |
| `edgeConfig.relationshipTypeVariable` | edge | categorical | `[{ value: "parent", label: "Parent" }, { value: "partner", label: "Partner" }]` |
| `edgeConfig.isActiveVariable` | edge | boolean | none |
| `edgeConfig.isGestationalCarrierVariable` | edge | boolean | none |
| `nominationPrompts[].variable` | node | boolean | none |
