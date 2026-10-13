import {
  dynamicValueNamesIn,
  findDynamicMessageSyntaxProblem,
  findDynamicValueProblem,
  findMissingDynamicPlacement,
  type MissingDynamicPlacement,
  TOO_MANY_DYNAMIC_VERSIONS,
} from '../../localization/dynamicValueMessages.ts';
import type { LocaleTag } from '../../localization/localeTag.ts';
import type { StageSubject } from './common/subjects.ts';
import {
  CASED_VARIABLE_TYPES,
  dynamicValueArgumentsAt,
  type DynamicValueRole,
  type DynamicValueSite,
  type DynamicValueSiteContext,
  type DynamicValues,
  type DynamicValueVariable,
  dynamicValueRolesAt,
  dynamicValueStatus,
  parseDynamicValuePath,
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
        ? [[id, variable as DynamicValueVariable]]
        : [],
    ),
  );
};

const SUBJECT_ROLES: Readonly<
  Record<StageSubject['entity'], DynamicValueRole>
> = { ego: 'ego', node: 'node', edge: 'edge' };

/**
 * Everything that decides which values a site on `stage` can show: where it
 * sits (`sitePath`, from the stage's root, and `site`), the stage's type and
 * subject, and the codebook. Validation and Architect's palette both build
 * their answers from this.
 *
 * A form field shows the values of its form's subject only when that is the
 * stage's own subject: a Network Composer's edge forms each describe their
 * own edge type, which no stage binding can name unambiguously. Of the form's
 * subject, it cannot show what its own field or a later one asks for.
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
  const stageType =
    isRecord(stage) && typeof stage.type === 'string' ? stage.type : '';
  const stageSubject = stageSubjectOf(stage);

  let formSubject: StageSubject | undefined;
  let notYetWritten: DynamicValueSiteContext['notYetWritten'];
  if (site === 'formField') {
    // An object between the stage and the site that names its own subject
    // (a Network Composer edge type's form).
    const ownSubject = sitePath.some(
      (_step, length) =>
        length > 0 &&
        asSubject(valueAt(stage, [...sitePath.slice(0, length), 'subject'])) !==
          undefined,
    );
    formSubject = ownSubject ? undefined : stageSubject;
    const fieldsAt = sitePath.lastIndexOf('fields');
    const index = sitePath[fieldsAt + 1];
    const fields = valueAt(stage, sitePath.slice(0, fieldsAt + 1));
    if (
      formSubject !== undefined &&
      typeof index === 'number' &&
      Array.isArray(fields)
    ) {
      notYetWritten = {
        role: SUBJECT_ROLES[formSubject.entity],
        variables: new Set(
          fields
            .slice(index)
            .flatMap((field: unknown) =>
              isRecord(field) && typeof field.variable === 'string'
                ? [field.variable]
                : [],
            ),
        ),
      };
    }
  }

  return {
    roles: dynamicValueRolesAt(stageType, site, formSubject),
    variablesFor: (role) =>
      role === 'ego'
        ? variablesOf(codebook, { entity: 'ego' })
        : stageSubject?.entity === (role === 'edge' ? 'edge' : 'node')
          ? variablesOf(codebook, stageSubject)
          : undefined,
    notYetWritten,
  };
};

const describeVersion = (when: MissingDynamicPlacement['when']): string =>
  Object.entries(when)
    .map(([name, state]) =>
      state === 'missing'
        ? `"${name}" is missing`
        : state === 'other'
          ? `"${name}" has a value`
          : `"${name}" is ${state}`,
    )
    .join(', ');

type SiteHit = Readonly<{
  path: Path;
  value: Readonly<Record<string, string>>;
  dynamicValues?: DynamicValueSite;
}>;

const checkBindings = (
  stage: Record<string, unknown>,
  stageIndex: number,
  codebook: unknown,
): DynamicValueProblem[] => {
  const bindings = stage.dynamicValues;
  if (!isRecord(bindings)) return [];
  const stageSubject = stageSubjectOf(stage);
  return Object.entries(bindings).flatMap(([name, binding]) => {
    if (!isRecord(binding) || typeof binding.path !== 'string') return [];
    const cases = binding.cases;
    if (!isRecord(cases)) return [];
    const parsed = parseDynamicValuePath(binding.path);
    const base: Path = ['stages', stageIndex, 'dynamicValues', name, 'cases'];
    if (parsed?.kind !== 'attribute') {
      return [
        {
          path: base,
          message: 'Only an attribute with options can have cases.',
        },
      ];
    }
    const subject: StageSubject | undefined =
      parsed.role === 'ego'
        ? { entity: 'ego' }
        : stageSubject?.entity === (parsed.role === 'edge' ? 'edge' : 'node')
          ? stageSubject
          : undefined;
    const variable = variablesOf(codebook, subject)?.[parsed.variableId];
    // A missing variable is reported where the binding names it.
    if (variable === undefined) return [];
    if (!CASED_VARIABLE_TYPES.has(variable.type)) {
      return [
        {
          path: base,
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
            path: [...base, key],
            message: `Case "${key}" stands for ${JSON.stringify(optionValue)}, which is not one of the attribute's options.`,
          },
        ];
      }
      const earlier = caseFor.get(optionValue);
      if (earlier !== undefined) {
        return [
          {
            path: [...base, key],
            message: `Case "${key}" stands for ${JSON.stringify(optionValue)}, as case "${earlier}" already does, so it would never be chosen. Give each option at most one case.`,
          },
        ];
      }
      caseFor.set(optionValue, key);
      return [];
    });
  });
};

/**
 * Every problem with the dynamic values a protocol's stages show:
 * - at each site, a value that is not bound, not available there, or names
 *   an attribute that does not exist, and any misuse
 *   `findDynamicValueProblem` finds;
 * - each translation that leaves out a value the default-language text shows
 *   in some version;
 * - each binding case that stands for no option of its attribute, or for an
 *   option an earlier case already stands for.
 *
 * `hits` are the protocol's localized strings (`collectLocalizedStrings`).
 */
export const findDynamicValueProblems = (
  protocol: Readonly<{
    codebook: unknown;
    stages: readonly unknown[];
    defaultLocale: LocaleTag | undefined;
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

    const valid = new Set<LocaleTag>();
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
      const problem = unusable[0] ?? findDynamicValueProblem(message, values);
      if (problem === undefined) valid.add(locale);
      else problems.push({ path: [...hit.path, locale], message: problem });
    }

    const defaultLocale = protocol.defaultLocale;
    const original =
      defaultLocale === undefined ? undefined : hit.value[defaultLocale];
    if (
      defaultLocale === undefined ||
      original === undefined ||
      !valid.has(defaultLocale)
    ) {
      continue;
    }
    for (const locale of valid) {
      if (locale === defaultLocale) continue;
      const translation = hit.value[locale];
      if (translation === undefined) continue;
      const missing = findMissingDynamicPlacement(
        original,
        defaultLocale,
        translation,
        locale,
        values,
      );
      if (missing === undefined) continue;
      if (missing === TOO_MANY_DYNAMIC_VERSIONS) {
        problems.push({
          path: [...hit.path, locale],
          message: `This text and its translation choose between too many versions to check that the translation shows every value the ${defaultLocale} text does. Choose between fewer values in it.`,
        });
        continue;
      }
      problems.push({
        path: [...hit.path, locale],
        message: `This translation must show "{${missing.argument}}" where the ${defaultLocale} text does, including in its version for when ${describeVersion(missing.when)}.`,
      });
    }
  }
  return problems;
};
