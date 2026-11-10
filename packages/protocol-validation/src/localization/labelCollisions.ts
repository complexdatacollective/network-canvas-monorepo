import { findDuplicateDiseaseLabels } from '../schemas/9/stages/narrative-pedigree.ts';
import type { CurrentProtocol } from '../schemas/index.ts';
import type { ProtocolValidationIssue } from '../validation/validate-protocol.ts';
import {
  type DuplicateLabel,
  findDuplicateOptionLabels,
} from './duplicateLabels.ts';

/**
 * Two labels a participant would read the same way, where they choose between
 * them: two options of one attribute, or two diseases of one Narrative
 * Pedigree stage (`findDuplicateLocalizedLabels`).
 *
 * A protocol being written may hold one: a change of the protocol's
 * languages can make two labels read the same through fallback, and is made
 * anyway, so the researcher is shown the collision rather than refused the
 * change. A protocol handed over may not: every host refuses to import one,
 * a protocol migrated from an earlier schema is refused, and Architect will
 * not download one (`labelCollisionIssues`).
 */
export type LabelCollision = Readonly<
  {
    duplicate: DuplicateLabel;
    /** The path of the earlier label, and of the later one that repeats it. */
    paths: readonly [
      readonly (string | number)[],
      readonly (string | number)[],
    ];
  } & (
    | {
        kind: 'option';
        subject:
          | Readonly<{ entity: 'ego' }>
          | Readonly<{ entity: 'node' | 'edge'; type: string }>;
        variableId: string;
        /** The attribute's name, or its id where it has none. */
        variableName: string;
      }
    | { kind: 'disease'; stageIndex: number; stageId: string }
  )
>;

type Subject = Extract<LabelCollision, { kind: 'option' }>['subject'];

const optionCollisions = (
  protocol: CurrentProtocol,
  subject: Subject,
  variables: Readonly<Record<string, unknown>> | undefined,
): LabelCollision[] => {
  const at =
    subject.entity === 'ego'
      ? ['codebook', 'ego']
      : ['codebook', subject.entity, subject.type];
  return Object.entries(variables ?? {}).flatMap(([variableId, variable]) => {
    if (typeof variable !== 'object' || variable === null) return [];
    const name: unknown = Reflect.get(variable, 'name');
    const options: unknown = Reflect.get(variable, 'options');
    const labelPath = (index: number) => [
      ...at,
      'variables',
      variableId,
      'options',
      index,
      'label',
    ];
    return findDuplicateOptionLabels(options, protocol.localization).map(
      (duplicate): LabelCollision => ({
        kind: 'option',
        subject,
        variableId,
        variableName: typeof name === 'string' ? name : variableId,
        duplicate,
        paths: [labelPath(duplicate.firstIndex), labelPath(duplicate.index)],
      }),
    );
  });
};

/**
 * Every pair of labels in `protocol` a participant would read the same way:
 * the stages' diseases in stage order, then the codebook's options, node
 * types, edge types and then ego. Each pair once per language it reads the
 * same in.
 */
export const findLabelCollisions = (
  protocol: CurrentProtocol,
): LabelCollision[] => {
  const collisions: LabelCollision[] = [];
  protocol.stages.forEach((stage, stageIndex) => {
    if (stage.type !== 'NarrativePedigree') return;
    const labelPath = (index: number) => [
      'stages',
      stageIndex,
      'diseases',
      index,
      'label',
    ];
    for (const duplicate of findDuplicateDiseaseLabels(
      stage.diseases,
      protocol.localization,
    )) {
      collisions.push({
        kind: 'disease',
        stageIndex,
        stageId: stage.id,
        duplicate,
        paths: [labelPath(duplicate.firstIndex), labelPath(duplicate.index)],
      });
    }
  });
  for (const entity of ['node', 'edge'] as const) {
    for (const [type, definition] of Object.entries(
      protocol.codebook[entity] ?? {},
    )) {
      collisions.push(
        ...optionCollisions(protocol, { entity, type }, definition.variables),
      );
    }
  }
  collisions.push(
    ...optionCollisions(
      protocol,
      { entity: 'ego' },
      protocol.codebook.ego?.variables,
    ),
  );
  return collisions;
};

/** The issue code for two labels a participant would read the same way. */
export const DUPLICATE_LABEL = 'duplicate_label';

/**
 * Each label collision as a validation issue on the later label: what refuses
 * a protocol handed over (an import, a download, a migration from an earlier
 * schema) that holds one. A protocol being written is not refused for it.
 */
export const labelCollisionIssues = (
  protocol: CurrentProtocol,
): ProtocolValidationIssue[] => {
  const multilingual = protocol.localization.locales.length > 1;
  return findLabelCollisions(protocol).map((collision) => {
    const { duplicate } = collision;
    const language = multilingual ? ` (${duplicate.locale})` : '';
    const labels = `"${duplicate.firstText}" and "${duplicate.text}"`;
    return {
      code: DUPLICATE_LABEL,
      path: [...collision.paths[1]],
      message:
        collision.kind === 'option'
          ? `Options ${duplicate.firstIndex + 1} and ${duplicate.index + 1} of attribute "${collision.variableName}" have labels that read the same: ${labels}${language}. Each option needs a label participants can tell apart.`
          : `Diseases ${duplicate.firstIndex + 1} and ${duplicate.index + 1} have labels that read the same: ${labels}${language}. Each disease needs a label participants can tell apart.`,
    };
  });
};
