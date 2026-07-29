import { describe, expect, it } from 'vitest';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import { makeValidationFunction } from '@codaco/fresco-ui/form/validation/helpers';
import {
  asEntityAttributeReference,
  findValidationContradictions,
  type Codebook,
  type Variable,
  VARIABLE_REFERENCE_VALIDATIONS,
  type Variables,
} from '@codaco/protocol-validation';
import {
  DATE_PICKER_DEFAULT_MIN,
  DATE_PICKER_LATEST_DATE,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

const reference = asEntityAttributeReference;
const subject = { entity: 'node', type: 'person' } as const;
const runtimeNetwork: NcNetwork = {
  ego: {
    [entityPrimaryKeyProperty]: 'ego',
    [entityAttributesProperty]: {},
  },
  nodes: [],
  edges: [],
};

const comparisonRules = VARIABLE_REFERENCE_VALIDATIONS.filter(
  (
    rule,
  ): rule is Exclude<
    (typeof VARIABLE_REFERENCE_VALIDATIONS)[number],
    'sameAs' | 'differentFrom'
  > => rule !== 'sameAs' && rule !== 'differentFrom',
);

function validationRecord(
  variable: Variable,
): Readonly<Record<string, unknown>> {
  if (!('validation' in variable) || variable.validation === undefined) {
    return {};
  }
  return variable.validation;
}

function runtimeValidationProps(
  variableId: string,
  variable: Variable,
  context: ValidationContext,
): Record<string, unknown> {
  const validation = validationRecord(variable);
  const props: Record<string, unknown> = { validationContext: context };

  for (const rule of [
    'required',
    'minLength',
    'maxLength',
    'minValue',
    'maxValue',
    'minSelected',
    'maxSelected',
  ]) {
    const value = validation[rule];
    if (value !== undefined) props[rule] = value;
  }

  if (validation.unique === true) props.unique = variableId;

  for (const rule of ['sameAs', 'differentFrom'] as const) {
    const target = validation[rule];
    if (typeof target === 'string') props[rule] = target;
  }

  for (const rule of comparisonRules) {
    const target = validation[rule];
    if (typeof target === 'string') {
      props[rule] = { attribute: target, type: variable.type };
    }
  }

  if (
    variable.type === 'datetime' &&
    variable.component === 'DatePicker' &&
    variable.parameters !== undefined
  ) {
    const { min, max } = variable.parameters;
    if (typeof min === 'string') props.min = min;
    if (typeof max === 'string') props.max = max;
  }

  return props;
}

function optionValues(variable: Variable): (string | number | boolean)[] {
  if (!('options' in variable) || variable.options === undefined) return [];
  return variable.options.map(({ value }) => value);
}

function subsets(
  values: (string | number | boolean)[],
): (string | number | boolean)[][] {
  return Array.from({ length: 2 ** values.length }, (_unused, mask) =>
    values.filter((_value, at) => (mask & (1 << at)) !== 0),
  );
}

const MS_PER_DAY = 86_400_000;

function utcDay(ymd: string): number {
  const [year = 0, month = 1, day = 1] = ymd.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return Math.floor(date.getTime() / MS_PER_DAY);
}

function formatDay(dayNumber: number): string {
  const date = new Date(dayNumber * MS_PER_DAY);
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function dateDomain(
  variable: Extract<Variable, { type: 'datetime' }>,
): string[] {
  if (variable.component !== 'DatePicker') return [];
  const parameters = variable.parameters ?? {};
  const resolution =
    'type' in parameters ? (parameters.type ?? 'full') : 'full';
  const authoredMin =
    'min' in parameters && typeof parameters.min === 'string'
      ? parameters.min
      : undefined;
  const authoredMax =
    'max' in parameters && typeof parameters.max === 'string'
      ? parameters.max
      : undefined;

  if (resolution === 'year') {
    const floor = Number((authoredMin ?? DATE_PICKER_DEFAULT_MIN).slice(0, 4));
    const ceiling = Number(
      (
        authoredMax ??
        (authoredMin === undefined
          ? DATE_PICKER_DEFAULT_MIN
          : DATE_PICKER_LATEST_DATE)
      ).slice(0, 4),
    );
    return Array.from(
      { length: Math.max(0, ceiling - floor + 1) },
      (_unused, at) => String(floor + at).padStart(4, '0'),
    );
  }

  if (resolution === 'month') {
    const floor = (authoredMin ?? DATE_PICKER_DEFAULT_MIN).slice(0, 7);
    const ceiling = (
      authoredMax ??
      (authoredMin === undefined
        ? DATE_PICKER_DEFAULT_MIN
        : DATE_PICKER_LATEST_DATE)
    ).slice(0, 7);
    const [floorYear = 0, floorMonth = 1] = floor.split('-').map(Number);
    const [ceilingYear = 0, ceilingMonth = 1] = ceiling.split('-').map(Number);
    const first = floorYear * 12 + floorMonth - 1;
    const last = ceilingYear * 12 + ceilingMonth - 1;
    return Array.from(
      { length: Math.max(0, last - first + 1) },
      (_unused, at) => {
        const monthNumber = first + at;
        return `${String(Math.floor(monthNumber / 12)).padStart(4, '0')}-${String((monthNumber % 12) + 1).padStart(2, '0')}`;
      },
    );
  }

  const floor = utcDay(authoredMin ?? DATE_PICKER_DEFAULT_MIN);
  const ceiling = utcDay(authoredMax ?? authoredMin ?? DATE_PICKER_DEFAULT_MIN);
  return Array.from(
    { length: Math.max(0, ceiling - floor + 1) },
    (_unused, at) => formatDay(floor + at),
  );
}

function runtimeDomain(variable: Variable): FieldValue[] {
  switch (variable.type) {
    case 'boolean': {
      if (variable.component === 'Boolean') {
        const values = optionValues(variable);
        return values.length > 0 ? values : [false, true];
      }
      return [false, true];
    }
    case 'categorical':
      return subsets(optionValues(variable));
    case 'datetime':
      return dateDomain(variable);
    case 'ordinal':
      return optionValues(variable);
    case 'number':
      return Array.from({ length: 17 }, (_unused, at) => -2 + at / 2);
    case 'scalar':
      return [0, 0.25, 0.5, 0.75, 1];
    case 'text':
      return ['', 'a', 'aa', 'aaa', 'aaaa'];
    case 'layout':
      return [];
    default:
      return [];
  }
}

function codebookFor(variables: Variables): Codebook {
  return {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables,
      },
    },
  };
}

async function runtimeHasWitness(variables: Variables): Promise<boolean> {
  const entries = Object.entries(variables);
  const domains = entries.map(([, variable]) => runtimeDomain(variable));
  if (domains.some((domain) => domain.length === 0)) return false;

  const codebook = codebookFor(variables);
  const context: ValidationContext = {
    stageSubject: subject,
    codebook,
    network: runtimeNetwork,
  };
  const formValues: Record<string, FieldValue> = {};

  const search = async (at: number): Promise<boolean> => {
    if (at < entries.length) {
      const entry = entries[at];
      const domain = domains[at];
      if (entry === undefined || domain === undefined) return false;
      for (const value of domain) {
        formValues[entry[0]] = value;
        if (await search(at + 1)) return true;
      }
      return false;
    }

    for (const [variableId, variable] of entries) {
      const result = await makeValidationFunction(
        runtimeValidationProps(variableId, variable, context),
      )(formValues).safeParseAsync(formValues[variableId]);
      if (!result.success) return false;
    }
    return true;
  };

  return search(0);
}

function option(value: string | number) {
  return { label: `Option ${String(value)}`, value };
}

function required(validation: Record<string, unknown>) {
  return { required: true, ...validation };
}

function generatedFixture(seed: number): Variables {
  const family = (seed - 1) % 9;
  const variant = Math.floor((seed - 1) / 9);
  const offset = variant % 4;
  const year = 2020 + (variant % 5);
  const day = 1 + (variant % 20);
  const ymd = (delta: number) =>
    `${year}-03-${String(day + delta).padStart(2, '0')}`;

  if (family === 0) {
    return {
      a: {
        name: 'Cycle A',
        type: 'number',
        validation: required({
          minValue: 0,
          maxValue: 2 + offset,
          greaterThanVariable: reference('b'),
        }),
      },
      b: {
        name: 'Cycle B',
        type: 'number',
        validation: required({
          minValue: 0,
          maxValue: 2 + offset,
          greaterThanOrEqualToVariable: reference('a'),
        }),
      },
    };
  }

  if (family === 1) {
    const value = variant + 1;
    return {
      a: {
        name: 'Pinned A',
        type: 'ordinal',
        component: 'RadioGroup',
        options: [option(value)],
        validation: required({ differentFrom: reference('b') }),
      },
      b: {
        name: 'Pinned B',
        type: 'ordinal',
        component: 'RadioGroup',
        options: [option(value)],
        validation: required({}),
      },
    };
  }

  if (family === 2) {
    return {
      a: {
        name: 'Odd A',
        type: 'boolean',
        component: 'Toggle',
        validation: required({
          differentFrom: reference(variant % 2 === 0 ? 'b' : 'c'),
        }),
      },
      b: {
        name: 'Odd B',
        type: 'boolean',
        component: 'Toggle',
        validation: required({
          differentFrom: reference(variant % 2 === 0 ? 'c' : 'a'),
        }),
      },
      c: {
        name: 'Odd C',
        type: 'boolean',
        component: 'Toggle',
        validation: required({
          differentFrom: reference(variant % 2 === 0 ? 'a' : 'b'),
        }),
      },
    };
  }

  if (family === 3) {
    return {
      a: {
        name: 'External pin',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: ymd(0), max: ymd(0) },
        validation: required(
          variant % 2 === 0 ? {} : { differentFrom: reference('c') },
        ),
      },
      b: {
        name: 'Comparator pin',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: ymd(0), max: ymd(0) },
        validation: required({
          lessThanOrEqualToVariable: reference('c'),
        }),
      },
      c: {
        name: 'Collapsed range',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: ymd(0), max: ymd(1) },
        validation: required({
          lessThanOrEqualToVariable: reference('b'),
          ...(variant % 2 === 0 ? { differentFrom: reference('a') } : {}),
        }),
      },
    };
  }

  if (family === 4) {
    return {
      a: {
        name: 'Ceiling range',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '9999' },
        validation: required(
          variant % 2 === 0 ? { differentFrom: reference('b') } : {},
        ),
      },
      b: {
        name: 'Ceiling pin',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '9999', max: '9999' },
        validation: required(
          variant % 2 === 0 ? {} : { differentFrom: reference('a') },
        ),
      },
    };
  }

  if (family === 5) {
    return {
      a: {
        name: 'Cascade A',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: ymd(0), max: ymd(0) },
        validation: required(
          variant % 2 === 0 ? { differentFrom: reference('b') } : {},
        ),
      },
      b: {
        name: 'Cascade B',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: ymd(0), max: ymd(1) },
        validation: required({
          differentFrom: reference(variant % 2 === 0 ? 'c' : 'a'),
        }),
      },
      c: {
        name: 'Cascade C',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: ymd(1), max: ymd(2) },
        validation: required(
          variant % 2 === 0 ? {} : { differentFrom: reference('b') },
        ),
      },
      d: {
        name: 'Cascade D',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: ymd(2), max: ymd(2) },
        validation: required({ differentFrom: reference('c') }),
      },
    };
  }

  if (family === 6) {
    return {
      a: {
        name: 'Too many choices',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [option(`x-${variant}`), option(`y-${variant}`)],
        validation: required({ minSelected: 3 }),
      },
    };
  }

  if (family === 7) {
    return variant % 2 === 0
      ? {
          a: {
            name: 'Required empty text',
            type: 'text',
            component: 'Text',
            validation: required({ maxLength: 0 }),
          },
        }
      : {
          a: {
            name: 'Required empty selection',
            type: 'categorical',
            component: 'CheckboxGroup',
            options: [option(`x-${variant}`), option(`y-${variant}`)],
            validation: required({ maxSelected: 0 }),
          },
        };
  }

  return {
    a: {
      name: 'Inverted',
      type: 'number',
      validation: required({ minValue: variant + 2, maxValue: variant + 1 }),
    },
  };
}

describe('analyser to runtime conformance property', () => {
  it(
    'finds no real-validator witness for every generated analyser rejection',
    { timeout: 120_000 },
    async () => {
      const failures: {
        seed: number;
        contradictionClasses: string[];
      }[] = [];

      for (let seed = 1; seed <= 180; seed++) {
        const variables = generatedFixture(seed);
        const contradictions = findValidationContradictions(variables, {
          stageEffectiveComponents: true,
        });
        expect(contradictions.length, `seed ${seed}`).toBeGreaterThan(0);
        if (await runtimeHasWitness(variables)) {
          failures.push({
            seed,
            contradictionClasses: contradictions.map(
              ({ class: contradictionClass }) => contradictionClass,
            ),
          });
        }
      }

      expect(failures).toEqual([]);
    },
  );
});
