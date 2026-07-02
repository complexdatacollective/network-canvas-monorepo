import { createSelector } from '@reduxjs/toolkit';
import { invariant } from 'es-toolkit';

import type {
  ComponentType,
  ComposerFormField,
  FormField,
  Variable,
} from '@codaco/protocol-validation';

import { getCodebook } from '../store/modules/protocol';
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
    if (!variables[variable]) {
      throw new Error(`Missing codebook entry for variable: ${variable}`);
    }

    const codebookEntry = variables[variable];

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
    const component = fieldComponent ?? codebookComponent;
    invariant(component !== undefined, 'Missing component for form field');

    const fieldParameters =
      'parameters' in field ? field.parameters : undefined;
    const codebookParameters =
      'parameters' in codebookEntry ? codebookEntry.parameters : undefined;
    const parameters = fieldParameters ?? codebookParameters;

    return {
      ...codebookEntry,
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

export const getValidationContext = createSelector(
  [getCodebook, getNetwork, getStageSubject],
  (codebook, network, stageSubject) => ({
    codebook,
    network,
    stageSubject,
  }),
);
