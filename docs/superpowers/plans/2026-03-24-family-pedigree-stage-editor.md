# Family Pedigree Stage Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the FamilyTreeCensus stage editor with a new FamilyPedigree editor matching the restructured protocol validation schema.

**Architecture:** New section components in `sections/FamilyPedigree/` replace the old `sections/FamilyTreeCensus/` directory. The FamilyPedigree schema uses `nodeConfig.type` and `edgeConfig.type` instead of the standard `subject` field, so sections read these directly from the form rather than using `withSubject`/`withDisabledSubjectRequired` HOCs. Form field editing reuses `FieldFields` from `sections/Form/` with an adapted field path. Preview components that would normally use `withSubject` instead read `nodeConfig.type` directly from the form via `formValueSelector`.

**Tech Stack:** React, Redux Form, recompose HOCs, Zod schemas, Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-family-pedigree-stage-editor-design.md`

**Important constraints:**
- Do NOT use sub-agents. Commit directly to the current branch.
- Create a changeset when finished.
- Run `pnpm lint:fix` and `pnpm typecheck` before each commit.
- The `withSubject` HOC reads from `subject` in the form. FamilyPedigree has no `subject` field — the node type is at `nodeConfig.type`. All FamilyPedigree sections must read entity types directly from the form using `formValueSelector`.
- `EditableList` passes `editProps` only to the **edit** component, NOT to the preview component. Preview components receive `{ form, fieldId, sortable, ...item }` (the item's own data fields spread). Preview components that need the node/edge type must read it from the parent form using `formValueSelector` and the `form` prop.
- Avoid `as Type` assertions per project rules. Use explicit type annotations instead.

---

## File Structure

### New Files (all in `apps/architect-vite/src/components/sections/FamilyPedigree/`)

| File | Responsibility |
|------|---------------|
| `NodeConfiguration.tsx` | Section: node type picker (`nodeConfig.type`), ego/relationship variable pickers, form fields `EditableList`. Handles reset-on-type-change. |
| `NodeFormFieldPreview.tsx` | Preview component for form field list items. Reads `nodeConfig.type` from form instead of using `withSubject`. |
| `EdgeConfiguration.tsx` | Section: edge type picker (`edgeConfig.type`), relationship type/isActive/gestationalCarrier variable pickers. |
| `CensusPrompt.tsx` | Section: single required rich text field for `censusPrompt`. |
| `NominationPrompts.tsx` | Section: toggleable `EditableList` for `nominationPrompts` array. |
| `NominationPromptFields.tsx` | Edit component for individual nomination prompt (text + boolean variable picker). |
| `NominationPromptPreview.tsx` | Preview component for nomination prompt list items. Reads `nodeConfig.type` from form. |

### Modified Files

| File | Change |
|------|--------|
| `apps/architect-vite/src/components/StageEditor/Interfaces.tsx` | Remove FamilyTreeCensus imports and entry. Add FamilyPedigree imports (direct, not via barrel) and entry. |
| `apps/architect-vite/src/components/Screens/NewStageScreen/interfaceOptions.ts` | Replace `"FamilyTreeCensus"` with `"FamilyPedigree"` in `INTERFACE_TYPE_NAMES` array and `INTERFACE_TYPES` config. |
| `apps/architect-vite/src/components/sections/index.tsx` | Remove FamilyTreeCensus re-exports. Do NOT add FamilyPedigree exports (imported directly in Interfaces.tsx). |

### Removed Files

All files in `apps/architect-vite/src/components/sections/FamilyTreeCensus/` (8 files).

---

## Tasks

### Task 1: Create CensusPrompt section

The simplest section — a single rich text field. Start here to establish the pattern.

**Files:**
- Create: `apps/architect-vite/src/components/sections/FamilyPedigree/CensusPrompt.tsx`

- [ ] **Step 1: Create CensusPrompt.tsx**

```tsx
import { Row, Section } from "~/components/EditorLayout";
import { Field as RichText } from "~/components/Form/Fields/RichText";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import ValidatedField from "~/components/Form/ValidatedField";
import IssueAnchor from "~/components/IssueAnchor";

const CensusPrompt = (_props: StageEditorSectionProps) => (
	<Section
		title="Census Prompt"
		summary={
			<p>Configure the prompt shown to participants during the family building phase.</p>
		}
	>
		<Row>
			<IssueAnchor fieldName="censusPrompt" description="Census Prompt" />
			<ValidatedField
				name="censusPrompt"
				component={RichText}
				componentProps={{ label: "Prompt for building the family tree" }}
				validation={{ required: true }}
			/>
		</Row>
	</Section>
);

export default CensusPrompt;
```

- [ ] **Step 2: Verify lint and types pass**

Run: `pnpm lint:fix && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/architect-vite/src/components/sections/FamilyPedigree/CensusPrompt.tsx
git commit -m "feat(architect): add CensusPrompt section for FamilyPedigree stage"
```

---

### Task 2: Create NominationPromptPreview component

**Files:**
- Create: `apps/architect-vite/src/components/sections/FamilyPedigree/NominationPromptPreview.tsx`

- [ ] **Step 1: Create NominationPromptPreview.tsx**

This is a presentational component used by `EditableList`/`OrderedList` to render each nomination prompt in the list. It receives the prompt's fields as spread props (`text`, `variable`, `id`) plus `form` and `fieldId` from `OrderedList`. It does NOT receive `editProps` — those only go to the edit component.

To get the node type, it reads `nodeConfig.type` from the parent form using `formValueSelector` and the `form` prop.

Pattern reference: `apps/architect-vite/src/components/sections/FamilyTreeCensus/DiseasePromptPreview.tsx`

```tsx
import { get } from "es-toolkit/compat";
import { useSelector } from "react-redux";
import { formValueSelector } from "redux-form";
import Badge from "~/components/Badge";
import { Markdown } from "~/components/Form/Fields";
import { getColorForType } from "~/config/variables";
import type { RootState } from "~/ducks/store";
import { getVariablesForSubject } from "~/selectors/codebook";

type NominationPromptPreviewProps = {
	text: string;
	variable: string;
	form: string;
};

const NominationPromptPreview = ({ text, variable, form }: NominationPromptPreviewProps) => {
	const nodeType = useSelector(
		(state: RootState) => formValueSelector(form)(state, "nodeConfig.type") as string | undefined,
	);

	const subjectVariables = useSelector((state: RootState) =>
		getVariablesForSubject(state, { entity: "node", type: nodeType }),
	);
	const codebookVariable = get(subjectVariables, variable, {}) as {
		name?: string;
		type?: string;
	};

	return (
		<div className="m-4 flex gap-2 flex-col">
			<Markdown label={text} className="[&>p]:m-0" />
			<div>
				<Badge color={getColorForType(codebookVariable.type)}>
					<strong>{codebookVariable.type}</strong>
					{" variable: "}
					<strong>{codebookVariable.name}</strong>
				</Badge>
			</div>
		</div>
	);
};

export default NominationPromptPreview;
```

- [ ] **Step 2: Verify lint and types pass**

Run: `pnpm lint:fix && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/architect-vite/src/components/sections/FamilyPedigree/NominationPromptPreview.tsx
git commit -m "feat(architect): add NominationPromptPreview for FamilyPedigree"
```

---

### Task 3: Create NominationPromptFields component

**Files:**
- Create: `apps/architect-vite/src/components/sections/FamilyPedigree/NominationPromptFields.tsx`

- [ ] **Step 1: Create NominationPromptFields.tsx**

This is the edit component shown in a dialog when the user clicks to edit a nomination prompt. It receives `editProps` from `EditableList` (including `nodeType`). It renders a prompt text field and a boolean variable picker.

Pattern reference: `apps/architect-vite/src/components/sections/FamilyTreeCensus/DiseasePromptFields.tsx`

```tsx
import { useSelector } from "react-redux";
import { change } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import ValidatedField from "~/components/Form/ValidatedField";
import VariablePicker from "~/components/Form/Fields/VariablePicker/VariablePicker";
import NewVariableWindow, { useNewVariableWindowState } from "~/components/NewVariableWindow";
import type { Entity } from "~/components/NewVariableWindow";
import PromptText from "~/components/sections/PromptText";
import { useAppDispatch } from "~/ducks/hooks";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubject } from "~/selectors/codebook";
import { getFieldId } from "~/utils/issues";

type NominationPromptFieldsProps = {
	nodeType?: string;
};

const nodeEntity: Entity = "node";

const NominationPromptFields = ({ nodeType }: NominationPromptFieldsProps) => {
	const dispatch = useAppDispatch();
	const variableOptions = useSelector((state: RootState) =>
		getVariableOptionsForSubject(state, { entity: "node", type: nodeType }),
	);

	const booleanVariables = variableOptions.filter((v) => v.type === "boolean");

	const handleCreatedNewVariable = (...args: unknown[]) => {
		const [id, params] = args as [string, { field: string }];
		dispatch(change("editable-list-form", params.field, id));
	};

	const [newVariableWindowProps, openNewVariableWindow] = useNewVariableWindowState(
		{
			entity: nodeEntity,
			type: nodeType ?? "",
			initialValues: { name: "", type: "boolean" },
			allowVariableTypes: ["boolean"],
		},
		handleCreatedNewVariable,
	);

	const handleNewVariable = (name: string) =>
		openNewVariableWindow({ initialValues: { name, type: "boolean" } }, { field: "variable" });

	return (
		<>
			<PromptText />
			<Section title="Variable" layout="vertical">
				<Row>
					<div id={getFieldId("variable")} />
					<ValidatedField
						name="variable"
						component={VariablePicker}
						validation={{ required: true }}
						componentProps={{
							entity: "node",
							type: nodeType,
							options: booleanVariables,
							onCreateOption: handleNewVariable,
						}}
					/>
				</Row>
			</Section>
			<NewVariableWindow {...newVariableWindowProps} />
		</>
	);
};

export default NominationPromptFields;
```

- [ ] **Step 2: Verify lint and types pass**

Run: `pnpm lint:fix && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/architect-vite/src/components/sections/FamilyPedigree/NominationPromptFields.tsx
git commit -m "feat(architect): add NominationPromptFields for FamilyPedigree"
```

---

### Task 4: Create NominationPrompts section

**Files:**
- Create: `apps/architect-vite/src/components/sections/FamilyPedigree/NominationPrompts.tsx`

- [ ] **Step 1: Create NominationPrompts.tsx**

Toggleable section wrapping an `EditableList` for the `nominationPrompts` array.

Pattern reference: `apps/architect-vite/src/components/sections/FamilyTreeCensus/DiseaseNominationPrompts.tsx`

```tsx
import { useCallback } from "react";
import { useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { Section } from "~/components/EditorLayout";
import EditableList from "~/components/EditableList";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import { useAppDispatch } from "~/ducks/hooks";
import { openDialog } from "~/ducks/modules/dialogs";
import type { RootState } from "~/ducks/store";
import NominationPromptFields from "./NominationPromptFields";
import NominationPromptPreview from "./NominationPromptPreview";

const NominationPrompts = ({ form }: StageEditorSectionProps) => {
	const dispatch = useAppDispatch();
	const getFormValue = formValueSelector(form);

	const nodeType = useSelector(
		(state: RootState) => getFormValue(state, "nodeConfig.type") as string | undefined,
	);

	const hasNominationPrompts = useSelector(
		(state: RootState) => getFormValue(state, "nominationPrompts") as unknown[] | undefined,
	);

	const isDisabled = !nodeType;

	const handleToggleChange = useCallback(
		async (newState: boolean) => {
			if (!hasNominationPrompts?.length || newState === true) {
				return true;
			}

			const confirm = await dispatch(
				openDialog({
					type: "Warning",
					title: "This will clear your nomination prompts",
					message:
						"This will clear your nomination prompts and delete any prompts you have created. Do you want to continue?",
					confirmLabel: "Clear prompts",
				}),
			).unwrap();

			if (confirm) {
				dispatch(change(form, "nominationPrompts", null));
				return true;
			}

			return false;
		},
		[dispatch, form, hasNominationPrompts],
	);

	return (
		<Section
			disabled={isDisabled}
			summary={
				<p>
					Optionally add prompts to collect attribute information about family members. Each prompt should ask about a
					specific condition or trait and will store the response in the selected boolean variable.
				</p>
			}
			title="Nomination Prompts"
			toggleable
			startExpanded={!!hasNominationPrompts?.length}
			handleToggleChange={handleToggleChange}
		>
			<EditableList
				previewComponent={NominationPromptPreview}
				editComponent={NominationPromptFields}
				title="Edit Prompt"
				fieldName="nominationPrompts"
				form={form}
				editProps={{ nodeType }}
			/>
		</Section>
	);
};

export default NominationPrompts;
```

**Key notes:**
- `editProps={{ nodeType }}` is passed only to `NominationPromptFields` (the edit component)
- `NominationPromptPreview` reads `nodeConfig.type` from the form itself using the `form` prop it receives from `OrderedList`
- Disabled state derived from `!nodeType` instead of HOC

- [ ] **Step 2: Verify lint and types pass**

Run: `pnpm lint:fix && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/architect-vite/src/components/sections/FamilyPedigree/NominationPrompts.tsx
git commit -m "feat(architect): add NominationPrompts section for FamilyPedigree"
```

---

### Task 5: Create EdgeConfiguration section

**Files:**
- Create: `apps/architect-vite/src/components/sections/FamilyPedigree/EdgeConfiguration.tsx`

- [ ] **Step 1: Create EdgeConfiguration.tsx**

Section containing edge type picker and three variable pickers. Variable pickers are disabled until an edge type is selected.

Pattern references:
- `apps/architect-vite/src/components/sections/FamilyTreeCensus/FamilyTreeEdgeType.tsx` (edge type picker)
- `apps/architect-vite/src/components/sections/FamilyTreeCensus/FamilyTreeVariables.tsx` (variable pickers with `NewVariableWindow`)

```tsx
import type { VariableOptions } from "@codaco/protocol-validation";
import { useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import ValidatedField from "~/components/Form/ValidatedField";
import VariablePicker from "~/components/Form/Fields/VariablePicker/VariablePicker";
import IssueAnchor from "~/components/IssueAnchor";
import NewVariableWindow, { useNewVariableWindowState } from "~/components/NewVariableWindow";
import type { Entity } from "~/components/NewVariableWindow";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import EntitySelectField from "~/components/sections/fields/EntitySelectField/EntitySelectField";
import { useAppDispatch } from "~/ducks/hooks";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubject } from "~/selectors/codebook";
import { optionsMatch } from "~/utils/variables";

const RELATIONSHIP_TYPE_OPTIONS: VariableOptions = [
	{ value: "parent", label: "Parent" },
	{ value: "partner", label: "Partner" },
];

const edgeEntity: Entity = "edge";

const nullLockedOptions: VariableOptions | null = null;

type VariableRowProps = {
	name: string;
	label: string;
	description: string;
	options: { value: string; label: string; type?: string }[];
	onCreateOption: (name: string) => void;
	edgeType: string;
};

const VariableRow = ({ name, label, description, options, onCreateOption, edgeType }: VariableRowProps) => (
	<div className="flex items-start gap-4">
		<div className="flex flex-col gap-1 pt-2 shrink-0 w-72">
			<span className="font-semibold">
				{label}
				<span className="text-error ms-0.5">*</span>
			</span>
			<span className="text-sm text-foreground/60 leading-snug">{description}</span>
		</div>
		<div className="relative flex-1">
			<IssueAnchor fieldName={name} description={`${label} Variable`} />
			<ValidatedField
				name={name}
				component={VariablePicker}
				validation={{ required: true }}
				componentProps={{
					entity: "edge",
					type: edgeType,
					label: "Select variable",
					options,
					onCreateOption,
				}}
			/>
		</div>
	</div>
);

const EdgeConfiguration = ({ form }: StageEditorSectionProps) => {
	const dispatch = useAppDispatch();
	const formSelector = formValueSelector(form);

	const edgeType = useSelector(
		(state: RootState) => formSelector(state, "edgeConfig.type") as string | undefined,
	);

	const edgeVariableOptions = useSelector((state: RootState) =>
		edgeType ? getVariableOptionsForSubject(state, { entity: "edge", type: edgeType }) : [],
	);

	const relationshipTypeCompatible = edgeVariableOptions.filter(
		(v) => v.type === "categorical" && optionsMatch(v.options, RELATIONSHIP_TYPE_OPTIONS),
	);
	const booleanEdgeVariables = edgeVariableOptions.filter((v) => v.type === "boolean");

	const handleCreatedVariable = (...args: unknown[]) => {
		const [id, params] = args as [string, { field: string }];
		dispatch(change(form, params.field, id));
	};

	const [variableWindowProps, openVariableWindow] = useNewVariableWindowState(
		{
			entity: edgeEntity,
			type: edgeType ?? "",
			initialValues: { name: "", type: "" },
			lockedOptions: nullLockedOptions,
		},
		handleCreatedVariable,
	);

	const handleNewRelationshipTypeVariable = (name: string) =>
		openVariableWindow(
			{ initialValues: { name, type: "categorical" }, lockedOptions: RELATIONSHIP_TYPE_OPTIONS },
			{ field: "edgeConfig.relationshipTypeVariable" },
		);

	const handleNewIsActiveVariable = (name: string) =>
		openVariableWindow(
			{ initialValues: { name, type: "boolean" }, lockedOptions: nullLockedOptions },
			{ field: "edgeConfig.isActiveVariable" },
		);

	const handleNewGestationalCarrierVariable = (name: string) =>
		openVariableWindow(
			{ initialValues: { name, type: "boolean" }, lockedOptions: nullLockedOptions },
			{ field: "edgeConfig.isGestationalCarrierVariable" },
		);

	return (
		<>
			<Section
				title="Edge Configuration"
				summary={<p>Select the edge type and configure variables for family relationships.</p>}
			>
				<Row>
					<IssueAnchor fieldName="edgeConfig.type" description="Edge Type" />
					<ValidatedField
						name="edgeConfig.type"
						entityType="edge"
						component={EntitySelectField}
						validation={{ required: true }}
					/>
				</Row>
				{edgeType && (
					<div className="flex flex-col gap-6 mt-6">
						<VariableRow
							name="edgeConfig.relationshipTypeVariable"
							label="Relationship Type"
							description="Stores the type of relationship between family members (parent or partner)."
							edgeType={edgeType}
							options={relationshipTypeCompatible}
							onCreateOption={handleNewRelationshipTypeVariable}
						/>
						<VariableRow
							name="edgeConfig.isActiveVariable"
							label="Is Active"
							description="Stores whether the relationship is currently active."
							edgeType={edgeType}
							options={booleanEdgeVariables}
							onCreateOption={handleNewIsActiveVariable}
						/>
						<VariableRow
							name="edgeConfig.isGestationalCarrierVariable"
							label="Gestational Carrier"
							description="Stores whether a parent is a gestational carrier (parent edges only)."
							edgeType={edgeType}
							options={booleanEdgeVariables}
							onCreateOption={handleNewGestationalCarrierVariable}
						/>
					</div>
				)}
			</Section>
			<NewVariableWindow {...variableWindowProps} />
		</>
	);
};

export default EdgeConfiguration;
```

**Key notes:**
- `edgeConfig.type` is stored as a raw string (not wrapped in `{ entity, type }` like the old `FamilyTreeEdgeType` which used `parse`/`format`). The new schema stores it directly.
- Entity constants (`edgeEntity`, `nullLockedOptions`) avoid `as Type` assertions.
- Variable pickers conditionally render only when `edgeType` is truthy.
- Single `NewVariableWindow` instance shared across all three variable pickers.

- [ ] **Step 2: Verify lint and types pass**

Run: `pnpm lint:fix && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/architect-vite/src/components/sections/FamilyPedigree/EdgeConfiguration.tsx
git commit -m "feat(architect): add EdgeConfiguration section for FamilyPedigree"
```

---

### Task 6: Create NodeFormFieldPreview component

**Files:**
- Create: `apps/architect-vite/src/components/sections/FamilyPedigree/NodeFormFieldPreview.tsx`

- [ ] **Step 1: Create NodeFormFieldPreview.tsx**

The standard `FieldPreview` from `sections/Form/FieldPreview` is wrapped with `withSubject`, which reads `subject` from the form. FamilyPedigree has no `subject` field, so `FieldPreview` would get `entity: "ego"` and `type: null`, breaking variable lookups.

This component reimplements `FieldPreview` to read `nodeConfig.type` from the form instead. The preview component receives `{ form, fieldId, sortable, ...item }` from `OrderedList`, where `item` contains `{ variable, prompt }`.

Pattern reference: `apps/architect-vite/src/components/sections/Form/FieldPreview.tsx`

```tsx
import { get } from "es-toolkit/compat";
import { useSelector } from "react-redux";
import { formValueSelector } from "redux-form";
import Badge from "~/components/Badge";
import { Markdown } from "~/components/Form/Fields";
import { getColorForType } from "~/config/variables";
import type { RootState } from "~/ducks/store";
import { getVariablesForSubject } from "~/selectors/codebook";

type NodeFormFieldPreviewProps = {
	variable: string;
	prompt: string;
	form: string;
};

const NodeFormFieldPreview = ({ variable, prompt, form }: NodeFormFieldPreviewProps) => {
	const nodeType = useSelector(
		(state: RootState) => formValueSelector(form)(state, "nodeConfig.type") as string | undefined,
	);

	const subjectVariables = useSelector((state: RootState) =>
		getVariablesForSubject(state, { entity: "node", type: nodeType }),
	);
	const codebookVariable = get(subjectVariables, variable, {}) as {
		type?: string;
		component?: string;
	};

	return (
		<div className="field-preview m-4 flex gap-2 flex-col">
			<Markdown label={prompt} className="[&>p]:m-0" />
			<div>
				<Badge color={getColorForType(codebookVariable.type)}>
					<strong>{codebookVariable.type}</strong>
					{" variable using "}
					<strong>{codebookVariable.component}</strong>
					{" input control"}
				</Badge>
			</div>
		</div>
	);
};

export default NodeFormFieldPreview;
```

- [ ] **Step 2: Verify lint and types pass**

Run: `pnpm lint:fix && pnpm typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/architect-vite/src/components/sections/FamilyPedigree/NodeFormFieldPreview.tsx
git commit -m "feat(architect): add NodeFormFieldPreview for FamilyPedigree"
```

---

### Task 7: Create NodeConfiguration section

The most complex section — combines node type picker, variable pickers, and form fields.

**Files:**
- Create: `apps/architect-vite/src/components/sections/FamilyPedigree/NodeConfiguration.tsx`

- [ ] **Step 1: Create NodeConfiguration.tsx**

Pattern references:
- `apps/architect-vite/src/components/sections/NodeType.tsx` (node type picker with reset-on-change)
- `apps/architect-vite/src/components/sections/FamilyTreeCensus/FamilyTreeVariables.tsx` (variable pickers)
- `apps/architect-vite/src/components/sections/Form/Form.tsx` (EditableList for form fields)
- `apps/architect-vite/src/components/sections/Form/withFormHandlers.tsx` (handleChangeFields logic)

```tsx
import type { VariableOptions } from "@codaco/protocol-validation";
import type { UnknownAction } from "@reduxjs/toolkit";
import { difference, keys } from "lodash";
import { useCallback } from "react";
import { connect, useSelector } from "react-redux";
import { compose, withHandlers } from "recompose";
import { change, type FormAction, formValueSelector, getFormValues, SubmissionError } from "redux-form";
import EditableList from "~/components/EditableList";
import { Row, Section } from "~/components/EditorLayout";
import ValidatedField from "~/components/Form/ValidatedField";
import VariablePicker from "~/components/Form/Fields/VariablePicker/VariablePicker";
import IssueAnchor from "~/components/IssueAnchor";
import NewVariableWindow, { useNewVariableWindowState } from "~/components/NewVariableWindow";
import type { Entity } from "~/components/NewVariableWindow";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import FieldFields from "~/components/sections/Form/FieldFields";
import { getCodebookProperties, itemSelector, normalizeField } from "~/components/sections/Form/helpers";
import EntitySelectField from "~/components/sections/fields/EntitySelectField/EntitySelectField";
import { getTypeForComponent } from "~/config/variables";
import { useAppDispatch } from "~/ducks/hooks";
import { createVariableAsync, updateVariableAsync } from "~/ducks/modules/protocol/codebook";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubject, makeGetVariable } from "~/selectors/codebook";
import { optionsMatch } from "~/utils/variables";
import NodeFormFieldPreview from "./NodeFormFieldPreview";

const nodeEntity: Entity = "node";

const BIOLOGICAL_SEX_OPTIONS: VariableOptions = [
	{ value: "male", label: "Male" },
	{ value: "female", label: "Female" },
	{ value: "intersex", label: "Intersex" },
	{ value: "unknown", label: "Unknown" },
];

// Fields that should NOT be reset when the node type changes.
// edgeConfig and censusPrompt are independent of node type.
const PRESERVE_ON_NODE_TYPE_CHANGE = [
	"id",
	"type",
	"label",
	"interviewScript",
	"skipLogic",
	"edgeConfig",
	"censusPrompt",
	"nodeConfig.type",
];

type VariableRowProps = {
	name: string;
	label: string;
	description: string;
	entityType: string;
	options: { value: string; label: string; type?: string }[];
	onCreateOption: (name: string) => void;
};

const VariableRow = ({ name, label, description, entityType, options, onCreateOption }: VariableRowProps) => (
	<div className="flex items-start gap-4">
		<div className="flex flex-col gap-1 pt-2 shrink-0 w-72">
			<span className="font-semibold">
				{label}
				<span className="text-error ms-0.5">*</span>
			</span>
			<span className="text-sm text-foreground/60 leading-snug">{description}</span>
		</div>
		<div className="relative flex-1">
			<IssueAnchor fieldName={name} description={`${label} Variable`} />
			<ValidatedField
				name={name}
				component={VariablePicker}
				validation={{ required: true }}
				componentProps={{
					entity: "node",
					type: entityType,
					label: "Select variable",
					options,
					onCreateOption,
				}}
			/>
		</div>
	</div>
);

type NodeConfigurationInnerProps = StageEditorSectionProps & {
	handleChangeFields: (fields: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const NodeConfigurationInner = ({ form, handleChangeFields }: NodeConfigurationInnerProps) => {
	const dispatch = useAppDispatch();
	const formSelector = formValueSelector(form);

	const nodeType = useSelector(
		(state: RootState) => formSelector(state, "nodeConfig.type") as string | undefined,
	);

	const formValues = useSelector((state: RootState) => getFormValues(form)(state));
	const formFields = keys(formValues);

	const handleResetStage = useCallback(() => {
		const fieldsToReset = difference(formFields, PRESERVE_ON_NODE_TYPE_CHANGE);
		for (const field of fieldsToReset) {
			dispatch(change(form, field, null) as UnknownAction);
		}
	}, [dispatch, formFields, form]);

	const nodeVariableOptions = useSelector((state: RootState) =>
		nodeType ? getVariableOptionsForSubject(state, { entity: "node", type: nodeType }) : [],
	);

	const booleanNodeVariables = nodeVariableOptions.filter((v) => v.type === "boolean");
	const biologicalSexCompatible = nodeVariableOptions.filter(
		(v) => v.type === "categorical" && optionsMatch(v.options, BIOLOGICAL_SEX_OPTIONS),
	);
	const textNodeVariables = nodeVariableOptions.filter((v) => v.type === "text");

	const handleCreatedVariable = (...args: unknown[]) => {
		const [id, params] = args as [string, { field: string }];
		dispatch(change(form, params.field, id));
	};

	const [variableWindowProps, openVariableWindow] = useNewVariableWindowState(
		{
			entity: nodeEntity,
			type: nodeType ?? "",
			initialValues: { name: "", type: "" },
			lockedOptions: null,
		},
		handleCreatedVariable,
	);

	const handleNewEgoVariable = (name: string) =>
		openVariableWindow(
			{ initialValues: { name, type: "boolean" }, lockedOptions: null },
			{ field: "nodeConfig.egoVariable" },
		);

	const handleNewBiologicalSexVariable = (name: string) =>
		openVariableWindow(
			{ initialValues: { name, type: "categorical" }, lockedOptions: BIOLOGICAL_SEX_OPTIONS },
			{ field: "nodeConfig.biologicalSexVariable" },
		);

	const handleNewRelationshipVariable = (name: string) =>
		openVariableWindow(
			{ initialValues: { name, type: "text" }, lockedOptions: null },
			{ field: "nodeConfig.relationshipVariable" },
		);

	return (
		<>
			<Section
				title="Node Configuration"
				summary={<p>Select the node type and configure variables and form fields for family members.</p>}
			>
				<Row>
					<IssueAnchor fieldName="nodeConfig.type" description="Node Type" />
					<ValidatedField
						name="nodeConfig.type"
						entityType="node"
						promptBeforeChange="You attempted to change the node type of a stage that you have already configured. Before you can proceed the stage must be reset, which will remove any existing configuration. Do you want to reset the stage now?"
						component={EntitySelectField}
						onChange={handleResetStage}
						validation={{ required: true }}
					/>
				</Row>

				{nodeType && (
					<>
						<div className="flex flex-col gap-6 mt-6">
							<VariableRow
								name="nodeConfig.egoVariable"
								label="Ego Identifier"
								description="A boolean variable to identify which node represents the participant (ego) in the family tree."
								entityType={nodeType}
								options={booleanNodeVariables}
								onCreateOption={handleNewEgoVariable}
							/>
							<VariableRow
								name="nodeConfig.biologicalSexVariable"
								label="Biological Sex"
								description="Stores the biological sex of each family member. Used for visual representation in the pedigree diagram."
								entityType={nodeType}
								options={biologicalSexCompatible}
								onCreateOption={handleNewBiologicalSexVariable}
							/>
							<VariableRow
								name="nodeConfig.relationshipVariable"
								label="Relationship to Participant"
								description="Stores each person's relationship to the participant (e.g., mother, uncle, daughter). Automatically calculated by the family tree interface."
								entityType={nodeType}
								options={textNodeVariables}
								onCreateOption={handleNewRelationshipVariable}
							/>
						</div>

						<Section
							title="Form Fields"
							summary={
								<p>
									Add fields to collect information about each family member. These fields will be shown when
									participants add or edit family members.
								</p>
							}
							layout="vertical"
						>
							<EditableList
								label="Form Fields"
								editComponent={FieldFields}
								editProps={{ type: nodeType, entity: "node" }}
								previewComponent={NodeFormFieldPreview}
								fieldName="nodeConfig.form"
								title="Edit Field"
								onChange={(value: unknown) => handleChangeFields(value as Record<string, unknown>)}
								normalize={(value: unknown) => normalizeField(value as Record<string, unknown>)}
								itemSelector={
									itemSelector("node", nodeType) as (
										state: Record<string, unknown>,
										params: { form: string; editField: string },
									) => unknown
								}
								form={form}
							/>
						</Section>
					</>
				)}
			</Section>
			<NewVariableWindow {...variableWindowProps} />
		</>
	);
};

// Adapted from sections/Form/withFormHandlers.tsx
// Reads nodeConfig.type instead of subject.type, hardcodes entity: "node"
const formHandlers = withHandlers({
	handleChangeFields:
		(props: {
			updateVariable: typeof updateVariableAsync;
			createVariable: typeof createVariableAsync;
			changeForm: (form: string, field: string, value: unknown) => FormAction;
			form: string;
			getVariable: (uuid: string) => ReturnType<ReturnType<typeof makeGetVariable>>;
			getNodeType: () => string | undefined;
		}) =>
		async (values: Record<string, unknown>) => {
			const { variable, component, _createNewVariable, ...rest } = values as {
				variable?: string;
				component?: string;
				_createNewVariable?: string;
				[key: string]: unknown;
			};

			const nodeType = props.getNodeType();
			const variableType = getTypeForComponent(component);
			const codebookProperties = getCodebookProperties(rest);
			const configuration = {
				type: variableType,
				component,
				...codebookProperties,
			};

			props.changeForm(props.form, "_modified", Date.now());

			if (!_createNewVariable) {
				const current = props.getVariable(variable ?? "");
				if (!current) {
					throw new SubmissionError({ _error: "Variable not found" });
				}

				const currentVar = current as { component?: string; type?: string; name?: string };
				const baseProps = {
					component: currentVar.component,
					type: currentVar.type,
					name: currentVar.name,
				};

				await props.updateVariable({
					entity: "node",
					type: nodeType ?? "",
					variable: variable ?? "",
					configuration: { ...baseProps, ...configuration } as Record<string, unknown>,
					merge: false,
				});

				return { variable, ...rest };
			}

			try {
				const result = await props.createVariable({
					entity: "node",
					type: nodeType ?? "",
					configuration: {
						...configuration,
						name: _createNewVariable,
					} as Record<string, unknown>,
				});
				const payload = result as unknown as { payload: { variable: string } };
				return { variable: payload.payload.variable, ...rest };
			} catch (e) {
				throw new SubmissionError({ variable: String(e) });
			}
		},
});

const mapStateToProps = (state: RootState, { form }: { form: string }) => ({
	getVariable: (uuid: string) => makeGetVariable(uuid)(state),
	getNodeType: () => formValueSelector(form)(state, "nodeConfig.type") as string | undefined,
});

const mapDispatchToProps = {
	changeForm: change as (form: string, field: string, value: unknown) => FormAction,
	updateVariable: updateVariableAsync,
	createVariable: createVariableAsync,
};

const NodeConfiguration = compose<NodeConfigurationInnerProps, StageEditorSectionProps>(
	connect(mapStateToProps, mapDispatchToProps),
	formHandlers,
)(NodeConfigurationInner);

export default NodeConfiguration;
```

**Key design decisions:**
- `nodeConfig.type` is stored as a raw string (no `parse`/`format` wrapper).
- Reset-on-type-change uses `PRESERVE_ON_NODE_TYPE_CHANGE` which specifically preserves `edgeConfig` and `censusPrompt` (independent of node type), unlike the generic `SUBJECT_INDEPENDENT_FIELDS`.
- `handleChangeFields` adapted from `withFormHandlers` — reads `nodeConfig.type` instead of `subject.type`, hardcodes `entity: "node"`.
- Uses `NodeFormFieldPreview` instead of the standard `FieldPreview` (which is wrapped with `withSubject`).
- `EditableList` uses `fieldName="nodeConfig.form"` instead of `"form.fields"`.

- [ ] **Step 2: Verify lint and types pass**

Run: `pnpm lint:fix && pnpm typecheck`

This is the most complex component. Type errors are likely. Common fixes:
- Adjust import paths if selectors or types don't match
- The `as Record<string, unknown>` casts in the formHandlers are inherited from the existing `withFormHandlers.tsx` pattern

- [ ] **Step 3: Commit**

```bash
git add apps/architect-vite/src/components/sections/FamilyPedigree/NodeConfiguration.tsx
git commit -m "feat(architect): add NodeConfiguration section for FamilyPedigree"
```

---

### Task 8: Wire up Interfaces.tsx and interfaceOptions.ts

**Files:**
- Modify: `apps/architect-vite/src/components/StageEditor/Interfaces.tsx`
- Modify: `apps/architect-vite/src/components/Screens/NewStageScreen/interfaceOptions.ts`
- Modify: `apps/architect-vite/src/components/sections/index.tsx`

- [ ] **Step 1: Update Interfaces.tsx**

Remove the FamilyTreeCensus-related imports from `~/components/sections`:
```
DiseaseNominationPrompts,
FamilyTreeEdgeType,
FamilyTreeVariables,
NameGenerationStep,
ScaffoldingStep,
```

Keep `NodeType` — it's still used by `NameGenerator` and `NameGeneratorQuickAdd`.

Add direct imports for the new FamilyPedigree sections:
```tsx
import CensusPrompt from "~/components/sections/FamilyPedigree/CensusPrompt";
import EdgeConfiguration from "~/components/sections/FamilyPedigree/EdgeConfiguration";
import NodeConfiguration from "~/components/sections/FamilyPedigree/NodeConfiguration";
import NominationPrompts from "~/components/sections/FamilyPedigree/NominationPrompts";
```

Replace the `FamilyTreeCensus` entry in `INTERFACE_CONFIGS` with:
```tsx
FamilyPedigree: {
	sections: [
		NodeConfiguration,
		EdgeConfiguration,
		CensusPrompt,
		NominationPrompts,
		SkipLogic,
		InterviewScript,
	],
	documentation: "https://documentation.networkcanvas.com/interface-documentation/family-pedigree/",
},
```

- [ ] **Step 2: Update interfaceOptions.ts**

In `INTERFACE_TYPE_NAMES`, replace `"FamilyTreeCensus"` with `"FamilyPedigree"`.

In `INTERFACE_TYPES`, replace the FamilyTreeCensus entry with:
```tsx
{
	category: CATEGORIES.GENERATORS,
	tags: [TAGS.CREATE_NODES, TAGS.CREATE_EDGES, TAGS.NODE_ATTRIBUTES],
	keywords: "family pedigree tree census namegenerator name generator nodes node edges edge",
	type: "FamilyPedigree",
	title: "Family Pedigree",
	description:
		"An interface for collecting family network data, allowing participants to build a family pedigree with relationships and capture additional attributes about family members.",
},
```

- [ ] **Step 3: Update sections/index.tsx**

Remove the FamilyTreeCensus re-exports block:
```tsx
export {
	DiseaseNominationPrompts,
	FamilyTreeEdgeType,
	FamilyTreeVariables,
	NameGenerationStep,
	ScaffoldingStep,
} from "./FamilyTreeCensus";
```

Do NOT add any FamilyPedigree exports.

- [ ] **Step 4: Verify lint and types pass**

Run: `pnpm lint:fix && pnpm typecheck`

This step is where type errors from the `StageType` union will surface. Since the schema already exports `FamilyPedigree` and removed `FamilyTreeCensus`, the `INTERFACE_CONFIGS` object (which `satisfies InterfaceRegistry`) will only type-check correctly after this change.

- [ ] **Step 5: Commit**

```bash
git add apps/architect-vite/src/components/StageEditor/Interfaces.tsx \
  apps/architect-vite/src/components/Screens/NewStageScreen/interfaceOptions.ts \
  apps/architect-vite/src/components/sections/index.tsx
git commit -m "feat(architect): wire up FamilyPedigree stage editor, remove FamilyTreeCensus"
```

---

### Task 9: Remove old FamilyTreeCensus files

**Files:**
- Remove: `apps/architect-vite/src/components/sections/FamilyTreeCensus/` (entire directory)

- [ ] **Step 1: Delete FamilyTreeCensus directory**

```bash
rm -rf apps/architect-vite/src/components/sections/FamilyTreeCensus/
```

- [ ] **Step 2: Verify no remaining references**

Search for any remaining imports of deleted files:
```bash
grep -r "FamilyTreeCensus" apps/architect-vite/src/ || echo "No references found"
grep -r "DiseaseNominationPrompts\|DiseasePromptFields\|DiseasePromptPreview\|FamilyTreeEdgeType\|FamilyTreeVariables\|NameGenerationStep\|ScaffoldingStep" apps/architect-vite/src/ || echo "No references found"
```

- [ ] **Step 3: Verify lint and types pass**

Run: `pnpm lint:fix && pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add -A apps/architect-vite/src/components/sections/FamilyTreeCensus/
git commit -m "chore(architect): remove old FamilyTreeCensus section components"
```

---

### Task 10: Verify the full build and run knip

- [ ] **Step 1: Build the architect-vite app**

Run: `pnpm --filter architect-vite build`

This validates that all imports resolve and the app compiles.

- [ ] **Step 2: Run knip to check for unused exports**

Run: `pnpm knip`

Check output for any unused exports related to this change.

- [ ] **Step 3: Run full lint and typecheck**

Run: `pnpm lint:fix && pnpm typecheck`

- [ ] **Step 4: Commit any knip/lint fixes if needed**

---

### Task 11: Create changeset

- [ ] **Step 1: Create changeset**

Create the changeset file manually:

```bash
cat > .changeset/family-pedigree-editor.md << 'EOF'
---
"architect-vite": minor
---

Replace FamilyTreeCensus stage editor with FamilyPedigree, matching restructured protocol schema. The new editor organizes configuration into Node Configuration and Edge Configuration sections, simplifies the census prompt, and generalizes disease nomination prompts into generic nomination prompts.
EOF
```

- [ ] **Step 2: Commit changeset**

```bash
git add .changeset/family-pedigree-editor.md
git commit -m "chore: add changeset for FamilyPedigree stage editor"
```
