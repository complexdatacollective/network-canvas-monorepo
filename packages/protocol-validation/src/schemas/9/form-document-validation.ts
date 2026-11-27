import { isRecord, valueAtPath } from '@codaco/shared-consts';

import {
  type ContentLogic,
  type ContentNodes,
  fieldIdsIn,
  logicBlocksIn,
  readContentDocument,
} from '../../localization/contentDocument.ts';
import { logicReads, logicVersions } from '../../localization/logic.ts';
import { textPlaceOf } from '../../utils/textPlace.ts';
import { parseDynamicValueName } from './dynamic-value-names.ts';

type Path = (string | number)[];

type FormDocumentProblem = Readonly<{ path: Path; message: string }>;

type TextHit = Readonly<{
  path: Path;
  value: Readonly<Record<string, string>>;
  fieldBlocks?: true;
}>;

export const FORM_DOCUMENT_PROBLEMS = {
  noFields: 'Add at least one field to this form.',
  unknownField: 'This form refers to a field that it does not have.',
  repeatedField: 'A field appears more than once in this form.',
  unplacedField: 'This field is not in the form in any language.',
  logicReadsOwnField:
    'A logic block cannot depend on a field inside it, because the field is shown only when the logic block shows it.',
  logicReadsOtherVersionField:
    'A logic block cannot depend on a field in another version of a logic block that contains it, because that field is not shown when this logic block is shown.',
} as const;

/** Whose attributes a form's fields write: the participant, a node or an edge. */
type FormRole = 'ego' | 'node' | 'edge';

const formRoleOf = (stage: unknown): FormRole | undefined => {
  if (!isRecord(stage)) return undefined;
  if (stage.type === 'EgoForm') return 'ego';
  const subject = stage.subject;
  if (
    isRecord(subject) &&
    (subject.entity === 'node' || subject.entity === 'edge')
  ) {
    return subject.entity;
  }
  // A Family Pedigree's person form describes the person, a node.
  return stage.type === 'FamilyPedigree' ? 'node' : undefined;
};

/**
 * The variables of the form's subject that a condition reads: its ego rules'
 * attributes for an ego form; for a node or edge form, the attributes of the
 * rules about that node or edge.
 */
const conditionVariables = (
  condition: unknown,
  role: FormRole,
): readonly string[] => {
  if (!isRecord(condition) || !Array.isArray(condition.rules)) return [];
  return condition.rules.flatMap((rule: unknown) => {
    if (!isRecord(rule) || !isRecord(rule.options)) return [];
    const attribute = rule.options.attribute;
    if (typeof attribute !== 'string') return [];
    const asked =
      role === 'ego'
        ? rule.type === 'ego'
        : rule.type === role && condition.about === role;
    return asked ? [attribute] : [];
  });
};

/**
 * The variables of the form's subject that a logic block chooses by
 * (`logicReads`): those its conditions' rules read, and the attribute whose
 * answers or number it reads.
 */
const logicVariables = (
  logic: ContentLogic,
  role: FormRole,
  conditions: unknown,
): readonly string[] => {
  const reads = logicReads(logic);
  return [
    ...reads.conditionIds.flatMap((conditionId) =>
      conditionVariables(valueAtPath(conditions, [conditionId]), role),
    ),
    ...reads.values.flatMap(({ name }) => {
      const parsed = parseDynamicValueName(name);
      return parsed?.kind === 'attribute' && parsed.role === role
        ? [parsed.variableId]
        : [];
    }),
  ];
};

/**
 * Every logic block of `nodes`, at any depth, with the fields in the other
 * versions of the logic blocks that contain it: for each block around it, the
 * fields of its versions other than the one that the block is in. Only one
 * version of a block is shown, so none of those fields is shown with it.
 */
const logicBlocksWithOtherVersions = (
  nodes: ContentNodes,
  around: readonly string[] = [],
): readonly Readonly<{ logic: ContentLogic; fieldIds: readonly string[] }>[] =>
  nodes.flatMap((node) => {
    if (node.kind !== 'logic') return [];
    const versions = logicVersions(node.logic).map(({ content }) => content);
    return [
      { logic: node.logic, fieldIds: around },
      ...versions.flatMap((content, index) =>
        logicBlocksWithOtherVersions(content, [
          ...around,
          ...versions.flatMap((other, otherIndex) =>
            otherIndex === index ? [] : fieldIdsIn(other),
          ),
        ]),
      ),
    ];
  });

/**
 * Every problem with the documents of the protocol's forms, in each
 * language on its own (a language's form may place different fields from
 * another's, which is not a problem):
 * - each document places at least one field, in any of its versions;
 * - every field it places is one of the form's `fields`, and is placed once;
 * - no logic block chooses by the answer to a field inside it, or to a field
 *   in another version of a logic block that contains it;
 * and, across languages, every one of the form's `fields` is placed by at
 * least one language's document.
 *
 * Where fields can be written, and how, is each translation's own check
 * (`findContentDocumentTextProblem`). `hits` are the protocol's localized
 * strings (`collectLocalizedStrings`).
 */
export const findFormDocumentProblems = (
  protocol: Readonly<{ stages: readonly unknown[] }>,
  hits: readonly TextHit[],
): FormDocumentProblem[] => {
  const problems: FormDocumentProblem[] = [];
  for (const hit of hits) {
    const place = textPlaceOf(hit.path);
    if (hit.fieldBlocks !== true || place.kind !== 'formContent') continue;
    const formPath = place.form;
    const form = valueAtPath(protocol, formPath);
    if (!isRecord(form)) continue;
    const fields = Array.isArray(form.fields) ? form.fields : [];
    const fieldIds = fields.map((field: unknown) =>
      isRecord(field) && typeof field.id === 'string' ? field.id : undefined,
    );
    const known = new Set(fieldIds.filter((id) => id !== undefined));
    const variableOf = new Map(
      fields.flatMap((field: unknown) =>
        isRecord(field) &&
        typeof field.id === 'string' &&
        typeof field.variable === 'string'
          ? [[field.id, field.variable] as const]
          : [],
      ),
    );
    const stage = valueAtPath(protocol, place.owner);
    const role = formRoleOf(stage);
    const conditions = isRecord(stage) ? stage.conditions : undefined;

    // Each written document is checked on its own reading. The fields that
    // they place together are the ones that `formFieldPlacement` places in
    // some language: a language that falls back reads one of these.
    const placed = new Set<string>();
    let everyLanguageRead = true;
    for (const [locale, message] of Object.entries(hit.value)) {
      const reading = readContentDocument(message);
      if (reading.problems.some(({ kind }) => kind === 'unreadable')) {
        everyLanguageRead = false;
        continue;
      }
      const path = [...hit.path, locale];
      const ids = fieldIdsIn(reading.nodes);
      for (const id of ids) placed.add(id);
      if (ids.length === 0) {
        problems.push({ path, message: FORM_DOCUMENT_PROBLEMS.noFields });
        continue;
      }
      if (ids.some((id) => !known.has(id))) {
        problems.push({ path, message: FORM_DOCUMENT_PROBLEMS.unknownField });
      }
      if (new Set(ids).size !== ids.length) {
        problems.push({ path, message: FORM_DOCUMENT_PROBLEMS.repeatedField });
      }
      if (role !== undefined) {
        // Whether a logic block reads the answer to one of `fieldIds`.
        const readsAnyOf = ({
          logic,
          fieldIds: read,
        }: Readonly<{ logic: ContentLogic; fieldIds: readonly string[] }>) => {
          const variables = new Set(logicVariables(logic, role, conditions));
          return read.some((id) => {
            const variable = variableOf.get(id);
            return variable !== undefined && variables.has(variable);
          });
        };
        if (logicBlocksIn(reading.nodes).some(readsAnyOf)) {
          problems.push({
            path,
            message: FORM_DOCUMENT_PROBLEMS.logicReadsOwnField,
          });
        }
        if (logicBlocksWithOtherVersions(reading.nodes).some(readsAnyOf)) {
          problems.push({
            path,
            message: FORM_DOCUMENT_PROBLEMS.logicReadsOtherVersionField,
          });
        }
      }
    }

    // A form without any translation is reported as text without one.
    if (!everyLanguageRead || Object.keys(hit.value).length === 0) continue;
    fieldIds.forEach((id, index) => {
      if (id !== undefined && !placed.has(id)) {
        problems.push({
          path: [...formPath, 'fields', index],
          message: FORM_DOCUMENT_PROBLEMS.unplacedField,
        });
      }
    });
  }
  return problems;
};
