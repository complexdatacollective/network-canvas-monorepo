import {
  type ContentNodes,
  type DynamicValueRole,
  fieldIdsIn,
  type LocaleTag,
  readContentDocument,
  shownFieldIds,
} from '@codaco/protocol-validation';
import { readOwnProperty } from '@codaco/shared-consts';

import { logicInputsFor, type LogicSources } from './logicInputs.ts';

/** Marks a reading as made by `formDocumentReading`, its one constructor. */
const READ_BY_CONSTRUCTOR = Symbol('formDocumentReading');

/**
 * A form's document in the language that the participant reads. Made only
 * by `formDocumentReading`, so that every reader lists the same fields.
 */
export type FormDocumentReading = Readonly<{
  nodes: ContentNodes;
  /** The language that the document is written in. */
  locale: LocaleTag;
  /** The variable of each field that the document places, by field id. */
  fieldVariables: ReadonlyMap<string, string>;
  [READ_BY_CONSTRUCTOR]: true;
}>;

/**
 * `form` read in one language: `document` is the text that the participant
 * is shown (as `resolveLocalizedString` resolves the form's `content`), and
 * the fields are the ones that it places. A field that only another
 * language's document places is not part of this form, so its attribute is
 * read as a stored attribute, never as one of the form's answers.
 */
export function formDocumentReading(
  form: Readonly<{
    fields: readonly Readonly<{ id: string; variable: string }>[];
  }>,
  document: Readonly<{ text: string; locale: LocaleTag }>,
): FormDocumentReading {
  const { nodes } = readContentDocument(document.text);
  const variableOf = new Map(
    form.fields.map((field) => [field.id, field.variable]),
  );
  const fieldVariables = new Map<string, string>();
  for (const fieldId of fieldIdsIn(nodes)) {
    const variable = variableOf.get(fieldId);
    if (variable !== undefined) fieldVariables.set(fieldId, variable);
  }
  return {
    nodes,
    locale: document.locale,
    fieldVariables,
    [READ_BY_CONSTRUCTOR]: true,
  };
}

/** Which of a form's fields are shown, and what logic reads to show them. */
export type ShownFormFields = Readonly<{
  /** The ids of the fields that the document shows, in order. */
  shown: readonly string[];
  /**
   * The attributes of the entity that the form describes, without the
   * answer of any field that is not shown: what logic on the form reads.
   */
  attributes: Readonly<Record<string, unknown>>;
}>;

const NO_ATTRIBUTES: Readonly<Record<string, unknown>> = {};

/**
 * Stand-ins for the values that the interview always knows while a form is
 * on screen. Logic reads each of them only as present or missing
 * (validation gives a label and today's date no answers to choose a version
 * by, and no number), so any present value reads as the real one would: a
 * select on a date or a label chooses no case (`dynamicValueCaseOf`), a
 * number block reads either as no number, and rules never read them.
 */
const LABEL_AS_PRESENT = '';
const DATE_AS_PRESENT = new Date(0);

/**
 * The roles whose labels the interview always knows on a form whose fields
 * answer `answers`: the node that the form describes (a node being added
 * included), or the two nodes that an edge form's edge joins.
 */
const LABELLED_ROLES: Readonly<
  Partial<Record<DynamicValueRole, readonly DynamicValueRole[]>>
> = {
  node: ['node'],
  edge: ['edgeFrom', 'edgeTo'],
};

/**
 * `sources` with what the interview always knows while a form whose fields
 * answer `answers` is on screen, so that every reader of a form's logic (the
 * interview, synthetic data) shows the same fields: today's date and the
 * labels of the form's nodes. A value that the caller gives is kept; one it
 * has not worked out reads as present. The interview works out a node's
 * label from the form's shown answers, so its logic cannot be given the
 * label first; synthetic data labels no node.
 */
const withWhatAFormAlwaysKnows = (
  sources: LogicSources,
  answers: DynamicValueRole,
): LogicSources => {
  const labels: Partial<Record<DynamicValueRole, string>> = {
    ...sources.labels,
  };
  for (const role of LABELLED_ROLES[answers] ?? []) {
    labels[role] ??= LABEL_AS_PRESENT;
  }
  return {
    ...sources,
    intrinsics: {
      ...sources.intrinsics,
      now: sources.intrinsics?.now ?? DATE_AS_PRESENT,
    },
    labels,
  };
};

/** `attributes` without the values of `variables`, each other key kept as its own. */
const without = (
  attributes: Readonly<Record<string, unknown>>,
  variables: ReadonlySet<string>,
): Record<string, unknown> =>
  // Built with fromEntries, so that an attribute keyed by a roster column's
  // heading such as `__proto__` stays an entry of its own.
  Object.fromEntries(
    Object.entries(attributes).filter(([name]) => !variables.has(name)),
  );

/**
 * The fields of a form's document that its logic shows, where logic reads
 * `sources`, with the form's answers so far as the attributes of `answers`
 * (the role of the entity that the form describes), and what the interview
 * always knows while a form is on screen (`withWhatAFormAlwaysKnows`).
 *
 * Logic can read the answers on its own form, so hiding one field can hide
 * another that reads it. The participant never sees a hidden field, so an
 * answer to one, whether it was given before the field was hidden or is
 * stored, never decides what is shown: the shown fields are worked out
 * again without the answers of the hidden fields until they no longer
 * change. A document with n fields settles within n + 1 rounds unless its
 * logic contradicts itself, when the last reading stands.
 *
 * The interview shows a form's fields this way, and clears the answer to a
 * hidden field when the form is submitted; synthetic data answers only the
 * fields that it shows.
 */
export function formShownFields(
  document: FormDocumentReading,
  sources: LogicSources,
  answers: DynamicValueRole,
): ShownFormFields {
  const known = withWhatAFormAlwaysKnows(sources, answers);
  const given = known.attributes[answers] ?? NO_ATTRIBUTES;
  const readingWithout = (hidden: ReadonlySet<string>) => {
    const attributes = hidden.size === 0 ? given : without(given, hidden);
    const shown = shownFieldIds(
      document.nodes,
      logicInputsFor(
        {
          ...known,
          attributes: { ...known.attributes, [answers]: attributes },
        },
        document.locale,
      ),
    );
    return { shown, attributes };
  };
  const hiddenVariables = (shown: readonly string[]) => {
    const showing = new Set(shown);
    const hidden = new Set<string>();
    for (const [fieldId, variable] of document.fieldVariables) {
      if (
        !showing.has(fieldId) &&
        readOwnProperty(given, variable) !== undefined
      ) {
        hidden.add(variable);
      }
    }
    return hidden;
  };

  let hidden = new Set<string>();
  let reading = readingWithout(hidden);
  for (let round = 0; round <= document.fieldVariables.size; round++) {
    const next = hiddenVariables(reading.shown);
    if (next.size === hidden.size && [...next].every((v) => hidden.has(v))) {
      break;
    }
    hidden = next;
    reading = readingWithout(hidden);
  }
  return reading;
}
