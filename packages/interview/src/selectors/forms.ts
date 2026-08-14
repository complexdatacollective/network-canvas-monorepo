import { createSelector } from '@reduxjs/toolkit';
import { invariant } from 'es-toolkit';

import type { ValidationPropsCatalogue } from '@codaco/fresco-ui/form/Field/types';
import type {
  Codebook,
  ComponentType,
  ComposerFormField,
  FormField,
  Variable,
} from '@codaco/protocol-validation';

import { buildFieldValidationProps } from '../forms/buildFieldValidationProps';
import { getCodebook } from '../store/modules/protocol';
import type { RootState } from '../store/store';
import { getNetwork, getStageSubject } from './session';

export type Subject = {
  entity: 'node' | 'edge' | 'ego';
  type?: string;
};

/**
 * Selector that gets codebook variables for a subject passed as a prop.
 * This is used when the subject is known from component props rather than
 * from the current stage in Redux state.
 */
const getCodebookVariablesForProvidedSubject = createSelector(
  [getCodebook, (_state, subject: Subject | null) => subject],
  (codebook, subject) => {
    if (!subject) {
      return {};
    }

    if (subject.entity === 'ego') {
      return codebook?.ego?.variables ?? {};
    }

    const { entity, type } = subject;
    if (!type) {
      return {};
    }

    return codebook?.[entity]?.[type]?.variables ?? {};
  },
);

/**
 * Field metadata distributes over the `Variable` union so each variant keeps
 * its own discriminant (`type`) and variant-specific keys (`options`, the
 * variable's strict `parameters`), letting `useProtocolForm` narrow on
 * `'options' in field` / `field.type`. `component` and `parameters` are widened
 * because, for NetworkComposer, they come from the stage field instead of the
 * codebook variable — `parameters` there is a loose record, so reads are guarded
 * with `typeof` checks downstream rather than narrowed by component.
 */
type FieldMetadata = Variable extends infer V
  ? V extends Variable
    ? Omit<V, 'component' | 'parameters'> & {
        component: ComponentType;
        parameters?: Record<string, unknown>;
        variable: string;
        label: string;
        hint?: string;
        showValidationHints?: boolean;
      }
    : never
  : never;

/**
 * Look up a single codebook variable by name — the lookup both
 * `createFieldMetadata` (which throws when it's missing) and
 * `selectValidationMetadataForVariable` (which returns `undefined`) share.
 */
const getCodebookEntry = (
  variables: Record<string, Variable>,
  variable: string,
): Variable | undefined => variables[variable];

/**
 * The control a field actually renders with, given the one the protocol
 * authored (a NetworkComposer field's own choice, otherwise the codebook
 * variable's).
 *
 * A REQUIRED boolean never renders as a `Toggle`. A toggle is a
 * `role="switch"`, and ARIA gives a switch only `true`/`false` — there is no
 * "unset" — so an unanswered required boolean both looks and announces like a
 * definite "No" while `required` still refuses to let the participant
 * continue. The visible state, the stored value and the validation verdict
 * disagree, and the only way past it is to switch the control on and then off
 * again. `Boolean` asks the same two-valued question as a pair of radio cards
 * that genuinely start unselected, so every required boolean resolves to it
 * whatever the protocol authored.
 *
 * This is a rendering correction, not a protocol change: it applies to
 * protocols already in the field the moment they are loaded, with no schema
 * change, no migration and no revalidation. It also leaves the set of values
 * the question can produce exactly as it was — see `createFieldMetadata`,
 * which drops the codebook's boolean `options` for a swapped field so the
 * rendered choice stays the unconditional {Yes, No} a `Toggle` offers, and
 * nothing that reasons about a boolean's domain has to learn a new rule.
 */
const resolveRenderedComponent = (
  codebookEntry: Variable,
  authoredComponent: ComponentType,
): ComponentType => {
  if (codebookEntry.type !== 'boolean') return authoredComponent;
  if (authoredComponent !== 'Toggle') return authoredComponent;
  return codebookEntry.validation?.required === true
    ? 'Boolean'
    : authoredComponent;
};

/**
 * Creates field metadata from form fields and codebook variables.
 * Used by useProtocolForm to convert protocol form definitions to Field components.
 *
 * For NetworkComposer stages the input control (`component`) and its parameters
 * live on the stage field rather than the codebook variable, so `field.component`
 * takes precedence. For every other stage type the codebook variable provides the
 * control, preserving existing behaviour.
 */
const createFieldMetadata = (
  variables: Record<string, Variable>,
  fields: Array<FormField | ComposerFormField>,
): FieldMetadata[] => {
  // Return empty array if no variables (allows graceful handling during mount)
  if (!variables || Object.keys(variables).length === 0) {
    return [];
  }

  // Guard against invalid fields input
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields.map((field) => {
    const { variable, hint, showValidationHints } = field;
    const codebookEntry = getCodebookEntry(variables, variable);
    if (!codebookEntry) {
      throw new Error(`Missing codebook entry for variable: ${variable}`);
    }

    // Shared form fields caption with a required `prompt`; NetworkComposer
    // fields carry an optional `label` instead, falling back to the codebook
    // variable's name so an unlabelled attribute still reads naturally.
    const fieldLabel = 'label' in field ? field.label : undefined;
    const fieldPrompt = 'prompt' in field ? field.prompt : undefined;

    // The control (component) and its parameters may live on the stage field
    // (NetworkComposer) or, for every other stage, on the codebook variable.
    const fieldComponent = 'component' in field ? field.component : undefined;
    const codebookComponent =
      'component' in codebookEntry ? codebookEntry.component : undefined;
    const authoredComponent = fieldComponent ?? codebookComponent;
    invariant(
      authoredComponent !== undefined,
      'Missing component for form field',
    );
    const component = resolveRenderedComponent(
      codebookEntry,
      authoredComponent,
    );

    const fieldParameters =
      'parameters' in field ? field.parameters : undefined;
    const codebookParameters =
      'parameters' in codebookEntry ? codebookEntry.parameters : undefined;
    const parameters = fieldParameters ?? codebookParameters;

    // A required boolean swapped off `Toggle` renders `Boolean`'s own Yes/No
    // pair rather than the codebook's `options`. A toggle never rendered those
    // options — it is unconditionally two-valued — so carrying them into the
    // swapped control would silently change the question: a variable whose
    // options list only `{label: 'Yes', value: true}` would become a required
    // question the participant can only answer one way. Dropping them keeps
    // the rendered domain identical to the toggle's, which is what every other
    // layer (protocol-validation's satisfiability analyser included) already
    // assumes for a `Toggle`.
    const renderedEntry =
      component === authoredComponent ||
      codebookEntry.type !== 'boolean' ||
      !('options' in codebookEntry)
        ? codebookEntry
        : { ...codebookEntry, options: undefined };

    return {
      ...renderedEntry,
      ...(parameters !== undefined ? { parameters } : {}),
      component,
      variable,
      label: fieldLabel ?? fieldPrompt ?? codebookEntry.name ?? variable,
      hint,
      showValidationHints,
    };
  });
};

/**
 * Create field metadata from variables and fields directly (no Redux state needed).
 * Use this when you already have the variables from useStageSelector.
 */
export const selectFieldMetadataFromVariables = (
  variables: Record<string, Variable>,
  fields: Array<FormField | ComposerFormField>,
) => createFieldMetadata(variables, fields);

/**
 * The subset of field/variable data `validationPropsFor` actually reads:
 * the attribute name, its `type` (needed only to tag
 * greaterThanVariable/lessThanVariable-style comparisons), and the raw
 * `validation` block. Deliberately excludes `component` — `FieldMetadata` is
 * still assignable here (it's a strict superset), so useProtocolForm's real
 * form fields pass through unchanged.
 */
type ValidationSource = {
  variable: string;
  type: Variable['type'];
  validation?: unknown;
};

/**
 * Build a writer's validation-only metadata directly from a codebook
 * variable, bypassing `createFieldMetadata`/component resolution entirely.
 * For writers that render their OWN input and only ever need `.validation`
 * — CategoricalBin's "other" dialog and QuickNodeForm's quick-add field —
 * routing through `createFieldMetadata` would trip its "Missing component"
 * invariant on a component-less variable, which the schema permits and which
 * Architect's "Create New Variable" dialog produces by default. Returns
 * `undefined` when the variable isn't in the codebook, matching
 * `createFieldMetadata`'s "Missing codebook entry" guard.
 */
export function selectValidationMetadataForVariable(
  variables: Record<string, Variable>,
  variable: string,
): ValidationSource | undefined {
  const codebookEntry = getCodebookEntry(variables, variable);
  if (!codebookEntry) {
    return undefined;
  }

  return {
    variable,
    type: codebookEntry.type,
    validation:
      'validation' in codebookEntry ? codebookEntry.validation : undefined,
  };
}

/** ValidationSource keeps `validation` untyped; the mapping wants a record. */
function isRuleRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Derive a Field's validation props (required, maxLength, sameAs, etc.) from
 * a codebook variable's `validation` block. Shared by any writer that renders
 * a single ad-hoc Field for a codebook variable outside the form system (e.g.
 * CategoricalBin's "other" dialog, QuickNodeForm's quick-add field — see
 * `selectValidationMetadataForVariable`). Delegates to the same
 * `buildFieldValidationProps` mapping useProtocolForm applies to its rendered
 * fields — and that the synthetic-data conformance test asserts against — so
 * every writer honours the same rules from one mapping. A variable with no
 * `validation` block returns an empty object — there is no runtime fallback
 * to `required`.
 */
export function validationPropsFor(
  field: ValidationSource,
): Partial<ValidationPropsCatalogue> {
  const { validation } = field;
  return buildFieldValidationProps({
    type: field.type,
    variable: field.variable,
    ...(isRuleRecord(validation) ? { validation } : {}),
  });
}

/**
 * Select field metadata using a subject provided as a prop.
 * Use this when the subject is known from component props (e.g., in SlidesForm).
 */
export const selectFieldMetadataWithSubject = createSelector(
  [
    getCodebookVariablesForProvidedSubject,
    (
      _state,
      _subject: Subject | null,
      fields: Array<FormField | ComposerFormField>,
    ) => fields,
  ],
  createFieldMetadata,
);

// Explicit signature: naming `Codebook` keeps the type short enough for TS to
// serialize (the enlarged stage union otherwise trips TS7056).
export const getValidationContext: (
  state: RootState,
  currentStep: number,
) => {
  codebook: Codebook;
  network: ReturnType<typeof getNetwork>;
  stageSubject: ReturnType<typeof getStageSubject>;
} = createSelector(
  [getCodebook, getNetwork, getStageSubject],
  (codebook, network, stageSubject) => ({
    codebook,
    network,
    stageSubject,
  }),
);
