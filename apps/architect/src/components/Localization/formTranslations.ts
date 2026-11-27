import {
  type FormFieldDraft,
  formFieldDraftsOf,
} from '@codaco/protocol-builder/sections/form-document/formDocumentValue';
import {
  type CurrentProtocol,
  formFieldPlacement,
  type LocalizedString,
  type Variables,
} from '@codaco/protocol-validation';
import { valueAtPath } from '@codaco/shared-consts';

type Path = readonly (string | number)[];

/** The fields of the form at `formPath`, as the protocol has them. */
export const formFieldsAt = (
  protocol: CurrentProtocol | null | undefined,
  formPath: Path,
): FormFieldDraft[] =>
  formFieldDraftsOf(valueAtPath(protocol, [...formPath, 'fields']));

/**
 * The attributes of the form's subject: the variables of the participant, or
 * of the node or edge type, whose attributes the form's fields collect.
 */
export const formVariables = (
  protocol: CurrentProtocol | null | undefined,
  fields: readonly FormFieldDraft[],
): Readonly<Variables> => {
  const codebook = protocol?.codebook;
  if (codebook === undefined) return {};
  const candidates: (Variables | undefined)[] = [
    codebook.ego?.variables,
    ...Object.values(codebook.node ?? {}).map((type) => type.variables),
    ...Object.values(codebook.edge ?? {}).map((type) => type.variables),
  ];
  const collected = fields.flatMap(({ variable }) =>
    variable === '' ? [] : [variable],
  );
  return (
    candidates.find(
      (variables) =>
        variables !== undefined &&
        collected.some((variableId) => Object.hasOwn(variables, variableId)),
    ) ?? {}
  );
};

/** The fields that the form places in any language. */
const placedIn = (documents: LocalizedString): ReadonlySet<string> =>
  new Set(
    [...formFieldPlacement(documents, undefined).values()].flatMap((ids) => [
      ...ids,
    ]),
  );

/**
 * The fields of the form that no document places once `content` replaces
 * the form's text, among those that a document places now: the translation
 * table translates the text, and leaves taking a field out of the form to
 * the stage editor.
 */
export const fieldsLeftOut = (
  fields: readonly FormFieldDraft[],
  stored: LocalizedString,
  content: LocalizedString,
): FormFieldDraft[] => {
  const before = placedIn(stored);
  const after = placedIn(content);
  return fields.filter(({ id }) => before.has(id) && !after.has(id));
};
