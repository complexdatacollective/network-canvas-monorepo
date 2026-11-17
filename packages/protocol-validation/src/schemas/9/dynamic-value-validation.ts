import {
  dynamicValueNamesIn,
  findDynamicMessageSyntaxProblem,
  findDynamicValueProblem,
} from '../../localization/dynamicValueMessages.ts';
import type { StageSubject } from './common/subjects.ts';
import {
  CASED_VARIABLE_TYPES,
  dynamicValueArgumentsAt,
  type DynamicValueForm,
  type DynamicValueRole,
  type DynamicValueSite,
  type DynamicValueSiteContext,
  type DynamicValueStage,
  type DynamicValues,
  type DynamicValueVariable,
  dynamicValueAbsentRolesAt,
  dynamicValueParticipantRolesAt,
  dynamicValueRolesAt,
  dynamicValueStatus,
  FALSE_CASE,
  PARTICIPANT_CASE,
  parseDynamicValuePath,
  TRUE_CASE,
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
 * their own edge type, which no stage binding can name unambiguously.
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
 * Problems with the cases of `bindings`, which sit at `base`: a case that
 * stands for no option of its attribute, or for one an earlier case already
 * stands for, and cases on a value that has none. `variablesForRole` gives the
 * attributes of the entity a role names, or undefined where it names none.
 */
export const findBindingCaseProblems = (
  bindings: Record<string, unknown>,
  base: Path,
  variablesForRole: (
    role: DynamicValueRole,
  ) => Readonly<Record<string, DynamicValueVariable>> | undefined,
): DynamicValueProblem[] =>
  Object.entries(bindings).flatMap(([name, binding]) => {
    if (!isRecord(binding) || typeof binding.path !== 'string') return [];
    const cases = binding.cases;
    if (!isRecord(cases)) return [];
    const parsed = parseDynamicValuePath(binding.path);
    const casesPath: Path = [...base, name, 'cases'];
    // Whether a node is the participant has one case, for the participant;
    // everyone else reads `other`.
    if (parsed?.kind === 'participant') {
      return Object.entries(cases).flatMap(([key, value]) =>
        key === PARTICIPANT_CASE && value === true
          ? []
          : [
              {
                path: [...casesPath, key],
                message: `Whether the node is the participant has one case, "${PARTICIPANT_CASE}", standing for true; everyone else takes the "other" version.`,
              },
            ],
      );
    }
    // A condition is met or it is not: one case for each.
    if (parsed?.kind === 'condition') {
      return Object.entries(cases).flatMap(([key, value]) =>
        (key === TRUE_CASE && value === true) ||
        (key === FALSE_CASE && value === false)
          ? []
          : [
              {
                path: [...casesPath, key],
                message: `A condition has two cases, "${TRUE_CASE}" standing for true and "${FALSE_CASE}" standing for false.`,
              },
            ],
      );
    }
    if (parsed?.kind !== 'attribute') {
      return [
        {
          path: casesPath,
          message: 'Only an attribute with options can have cases.',
        },
      ];
    }
    const variable = variablesForRole(parsed.role)?.[parsed.variableId];
    // A missing variable is reported where the binding names it.
    if (variable === undefined) return [];
    if (!CASED_VARIABLE_TYPES.has(variable.type)) {
      return [
        {
          path: casesPath,
          message: 'Only an attribute with options can have cases.',
        },
      ];
    }
    const optionValues =
      variable.type === 'boolean'
        ? [true, false]
        : (variable.options ?? []).map((option) => option.value);
    // A select takes the first case its value matches, so a second case for
    // the same option could never be chosen.
    const caseFor = new Map<unknown, string>();
    return Object.entries(cases).flatMap(([key, optionValue]) => {
      if (!optionValues.includes(optionValue)) {
        return [
          {
            path: [...casesPath, key],
            message: `Case "${key}" stands for ${JSON.stringify(optionValue)}, which is not one of the attribute's options.`,
          },
        ];
      }
      const earlier = caseFor.get(optionValue);
      if (earlier !== undefined) {
        return [
          {
            path: [...casesPath, key],
            message: `Case "${key}" stands for ${JSON.stringify(optionValue)}, as case "${earlier}" already does, so it would never be chosen. Give each option at most one case.`,
          },
        ];
      }
      caseFor.set(optionValue, key);
      return [];
    });
  });

const checkBindings = (
  stage: Record<string, unknown>,
  stageIndex: number,
  codebook: unknown,
): DynamicValueProblem[] => {
  const bindings = stage.dynamicValues;
  if (!isRecord(bindings)) return [];
  const stageSubject = stageSubjectOf(stage);
  return findBindingCaseProblems(
    bindings,
    ['stages', stageIndex, 'dynamicValues'],
    (role) => {
      const subject: StageSubject | undefined =
        role === 'ego'
          ? { entity: 'ego' }
          : stageSubject?.entity === (role === 'edge' ? 'edge' : 'node')
            ? stageSubject
            : undefined;
      return variablesOf(codebook, subject);
    },
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
 * Every problem with the dynamic values a protocol's stages show:
 * - at each site, a value that is not bound, not available there, or names
 *   an attribute that does not exist, and any misuse
 *   `findDynamicValueProblem` finds;
 * - each binding case that stands for no option of its attribute, or for an
 *   option an earlier case already stands for.
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
  const problems: DynamicValueProblem[] = protocol.stages.flatMap(
    (stage, index) =>
      isRecord(stage) ? checkBindings(stage, index, protocol.codebook) : [],
  );

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
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the stage is raw here; its dynamicValues are shaped by DynamicValuesSchema and each binding is checked before use
    const bindings = (
      isRecord(stage.dynamicValues) ? stage.dynamicValues : {}
    ) as DynamicValues;
    const context = dynamicValueContextFor({
      codebook: protocol.codebook,
      stage,
      sitePath,
      site: hit.dynamicValues,
    });
    const values = dynamicValueArgumentsAt(bindings, context);

    for (const [locale, message] of Object.entries(hit.value)) {
      // The field's own check reports what needs no stage.
      if (findDynamicMessageSyntaxProblem(message) !== undefined) continue;
      const unusable = dynamicValueNamesIn(message).flatMap((name) => {
        const binding = Object.hasOwn(bindings, name)
          ? bindings[name]
          : undefined;
        if (binding === undefined) return [];
        const status = dynamicValueStatus(binding, context);
        return status.status === 'available'
          ? []
          : [`"${name}" cannot be shown here: ${status.reason}.`];
      });
      const problem =
        unusable[0] ?? findDynamicValueProblem(message, values, locale);
      if (problem !== undefined) {
        problems.push({ path: [...hit.path, locale], message: problem });
      }
    }
  }
  return problems;
};
