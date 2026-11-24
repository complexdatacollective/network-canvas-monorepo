import {
  findDynamicMessageSyntaxProblem,
  findDynamicValueProblem,
} from '../../localization/dynamicValueMessages.ts';
import type { StageSubject } from './common/subjects.ts';
import {
  dynamicValueArgumentsAt,
  type DynamicValueForm,
  type DynamicValueRole,
  type DynamicValueSite,
  type DynamicValueSiteContext,
  type DynamicValueStage,
  type DynamicValueVariable,
  dynamicValueAbsentRolesAt,
  dynamicValueParticipantRolesAt,
  dynamicValueReferencesIn,
  dynamicValueRolesAt,
  dynamicValueStatus,
} from './dynamic-values.ts';
type Path = (string | number)[];

export type DynamicValueProblem = Readonly<{ path: Path; message: string }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const valueAt = (value: unknown, path: readonly (string | number)[]) =>
  path.reduce<unknown>(
    (current, step) =>
      Array.isArray(current) && typeof step === 'number'
        ? current[step]
        : isRecord(current) && typeof step === 'string'
          ? current[step]
          : undefined,
    value,
  );

const asSubject = (value: unknown): StageSubject | undefined => {
  if (!isRecord(value)) return undefined;
  if (value.entity === 'ego') return { entity: 'ego' };
  if (
    (value.entity === 'node' || value.entity === 'edge') &&
    typeof value.type === 'string'
  ) {
    // The walk reads raw protocol data, where the branded type id is the
    // same string unbranded.
    return { entity: value.entity, type: value.type } as StageSubject;
  }
  return undefined;
};

/** What of a stage decides which values its text can show. */
const dynamicValueStageOf = (stage: unknown): DynamicValueStage => ({
  type: isRecord(stage) && typeof stage.type === 'string' ? stage.type : '',
  behaviours: isRecord(stage) ? stage.behaviours : undefined,
});

/** The subject a stage's own forms and interface describe. */
const stageSubjectOf = (stage: unknown): StageSubject | undefined =>
  isRecord(stage) && stage.type === 'EgoForm'
    ? { entity: 'ego' }
    : asSubject(isRecord(stage) ? stage.subject : undefined);

const variablesOf = (
  codebook: unknown,
  subject: StageSubject | undefined,
): Readonly<Record<string, DynamicValueVariable>> | undefined => {
  if (subject === undefined) return undefined;
  const variables =
    subject.entity === 'ego'
      ? valueAt(codebook, ['ego', 'variables'])
      : valueAt(codebook, [subject.entity, subject.type, 'variables']);
  if (!isRecord(variables)) return {};
  return Object.fromEntries(
    Object.entries(variables).flatMap(([id, variable]) =>
      isRecord(variable) && typeof variable.type === 'string'
        ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the codebook is raw here; only a record with a string `type` is kept, and the rest of a variable is read defensively
          [[id, variable as DynamicValueVariable]]
        : [],
    ),
  );
};

/**
 * The subject a form field's form describes: the subject of the nearest
 * object between the stage and the site that names its own (a Network
 * Composer edge type's form), else the stage's.
 */
const formOf = (
  stage: unknown,
  sitePath: readonly (string | number)[],
  stageSubject: StageSubject | undefined,
): DynamicValueForm | undefined => {
  for (let length = sitePath.length - 1; length > 0; length -= 1) {
    const own = asSubject(
      valueAt(stage, [...sitePath.slice(0, length), 'subject']),
    );
    if (own !== undefined) return { entity: own.entity, isStageSubject: false };
  }
  return stageSubject === undefined
    ? undefined
    : { entity: stageSubject.entity, isStageSubject: true };
};

/**
 * Everything that decides which values a site on `stage` can show: where it
 * sits (`sitePath`, from the stage's root, and `site`), the stage's type and
 * subject, and the codebook. Validation and Architect's palette both build
 * their answers from this.
 *
 * A form field shows the attributes of its form's subject only when that is
 * the stage's own subject: a Network Composer's edge forms each describe
 * their own edge type, which no stage text can name unambiguously.
 */
export const dynamicValueContextFor = ({
  codebook,
  stage,
  sitePath,
  site,
}: {
  codebook: unknown;
  stage: unknown;
  sitePath: readonly (string | number)[];
  site: DynamicValueSite;
}): DynamicValueSiteContext => {
  const stageSubject = stageSubjectOf(stage);
  const form =
    site === 'formField' ? formOf(stage, sitePath, stageSubject) : undefined;
  const valueStage = dynamicValueStageOf(stage);

  return {
    roles: dynamicValueRolesAt(valueStage, site, form),
    absentRoles: dynamicValueAbsentRolesAt(valueStage, site),
    participantRoles: dynamicValueParticipantRolesAt(valueStage, site, form),
    conditions: conditionsContextOf(
      isRecord(stage) ? stage.conditions : undefined,
    ),
    variablesFor: (role) => {
      if (role === 'ego') return variablesOf(codebook, { entity: 'ego' });
      // An edge's ends are nodes of any type.
      if (role === 'edgeFrom' || role === 'edgeTo') return undefined;
      return stageSubject?.entity === (role === 'edge' ? 'edge' : 'node')
        ? variablesOf(codebook, stageSubject)
        : undefined;
    },
  };
};

/**
 * What any text on `stage` can show, for a place that shows the stage's text
 * rather than editing one site of it (a collapsed preview, the protocol
 * summary): every value its prompts or its forms' fields could show, the
 * ends of a Network Composer edge type's form included.
 */
export const stageDynamicValueContext = ({
  codebook,
  stage,
}: {
  codebook: unknown;
  stage: unknown;
}): DynamicValueSiteContext => {
  const contextAt = (site: DynamicValueSite) =>
    dynamicValueContextFor({ codebook, stage, sitePath: [], site });
  const prompt = contextAt('prompt');
  const formField = contextAt('formField');
  const edgeForm = dynamicValueRolesAt(
    dynamicValueStageOf(stage),
    'formField',
    {
      entity: 'edge',
      isStageSubject: false,
    },
  );
  return {
    ...prompt,
    roles: new Set([...prompt.roles, ...formField.roles, ...edgeForm]),
    participantRoles: formField.participantRoles,
  };
};

type SiteHit = Readonly<{
  path: Path;
  value: Readonly<Record<string, string>>;
  dynamicValues?: DynamicValueSite;
}>;

/**
 * Why `message` cannot be text at a site described by `context`, or
 * undefined when it can: the first name it uses that refers to nothing, is
 * not available there, or gives a version for a case it does not have
 * (`text` is how the problem names the text: "This text", "This label"),
 * and then any misuse `findDynamicValueProblem` finds. Meant for messages
 * `findDynamicMessageSyntaxProblem` accepts.
 */
export const findSiteMessageProblem = (
  message: string,
  context: DynamicValueSiteContext,
  locale: string,
  text = 'This text',
): string | undefined => {
  for (const { name, parsed, caseKeys } of dynamicValueReferencesIn(message)) {
    const status = dynamicValueStatus(parsed, context, caseKeys);
    if (status.status !== 'available') {
      return `${text} cannot use "${name}": ${status.reason}.`;
    }
  }
  return findDynamicValueProblem(
    message,
    dynamicValueArgumentsAt(message, context),
    locale,
  );
};

/**
 * The conditions a stage or a node type's label declares, as a site sees
 * them: by id, with the role each one's rules are about.
 */
export const conditionsContextOf = (
  conditions: unknown,
): DynamicValueSiteContext['conditions'] => {
  if (!isRecord(conditions)) return undefined;
  return new Map(
    Object.entries(conditions).map(([id, condition]) => {
      const about = isRecord(condition) ? condition.about : undefined;
      return [
        id,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- raw protocol data; `ConditionSchema` holds `about` to its roles, and a role the text is not shown with is refused where the condition is used
        typeof about === 'string' ? { about: about as DynamicValueRole } : {},
      ];
    }),
  );
};

/**
 * Every problem with the dynamic values a protocol's stages show: at each
 * site, in each language, a name that refers to nothing (no such attribute,
 * condition or role), a value that site cannot show, a version for a case
 * the value does not have, and any misuse `findDynamicValueProblem` finds.
 *
 * `hits` are the protocol's localized strings (`collectLocalizedStrings`).
 */
export const findDynamicValueProblems = (
  protocol: Readonly<{
    codebook: unknown;
    stages: readonly unknown[];
  }>,
  hits: readonly SiteHit[],
): DynamicValueProblem[] => {
  const problems: DynamicValueProblem[] = [];
  for (const hit of hits) {
    const [root, stageIndex, ...sitePath] = hit.path;
    if (
      hit.dynamicValues === undefined ||
      root !== 'stages' ||
      typeof stageIndex !== 'number'
    ) {
      continue;
    }
    const stage = protocol.stages[stageIndex];
    if (!isRecord(stage)) continue;
    const context = dynamicValueContextFor({
      codebook: protocol.codebook,
      stage,
      sitePath,
      site: hit.dynamicValues,
    });
    for (const [locale, message] of Object.entries(hit.value)) {
      // The field's own check reports what needs no stage.
      if (findDynamicMessageSyntaxProblem(message) !== undefined) continue;
      const problem = findSiteMessageProblem(message, context, locale);
      if (problem !== undefined) {
        problems.push({ path: [...hit.path, locale], message: problem });
      }
    }
  }
  return problems;
};
