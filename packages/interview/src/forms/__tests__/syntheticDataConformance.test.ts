import { describe, expect, it } from 'vitest';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import { addDays, todayYmd } from '@codaco/fresco-ui/form/utils/ymd';
import { makeValidationFunction } from '@codaco/fresco-ui/form/validation/helpers';
import { generateNetwork } from '@codaco/protocol-utilities';
import {
  asEntityAttributeReference,
  type Codebook,
  type Stage,
  type StageSubject,
  type Variable,
  type VariableOptions,
  type Variables,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
  type VariableValue,
} from '@codaco/shared-consts';

import { buildFieldValidationProps } from '../buildFieldValidationProps';

/**
 * Pinned so generation and validation resolve RelativeDatePicker windows
 * against the same day: the generator reads `config.today` and useProtocolForm
 * reads `todayYmd()`, which are two clock reads that could straddle midnight.
 */
const today = todayYmd();

/**
 * The schema's own constructor for the branded string a variable-reference rule
 * carries. Aliased because the fixtures below use it on every such rule.
 */
const ref = asEntityAttributeReference;

// RelativeDatePicker's own defaults, as useProtocolForm applies them.
const RELATIVE_DEFAULT_BEFORE = 180;
const RELATIVE_DEFAULT_AFTER = 0;

/**
 * The interview seeds its form store from entity attributes with
 * `value ?? undefined` (NodeForm, SlidesForm, EgoForm), because FieldValue has
 * no null member. Mirrored here so the validators see the values a rendered
 * form would hold.
 */
function toFormValues(
  attributes: Record<string, VariableValue>,
): Record<string, FieldValue> {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]): [string, FieldValue] => [
      key,
      value ?? undefined,
    ]),
  );
}

/**
 * useProtocolForm turns a datetime variable's picker parameters into `min`/`max`
 * validators — absolute for DatePicker, anchor-relative for RelativeDatePicker.
 * Those are the only validators that bound a date, so a conformance check that
 * omitted them would leave every generated date unchecked.
 */
function datetimeBoundProps(variable: Variable): {
  min?: string;
  max?: string;
} {
  if (variable.type !== 'datetime') return {};

  if (variable.component === 'DatePicker' && variable.parameters) {
    const { min, max } = variable.parameters;
    return {
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
    };
  }

  if (variable.component === 'RelativeDatePicker' && variable.parameters) {
    const { anchor = today, before, after } = variable.parameters;
    return {
      min: addDays(anchor, -(before ?? RELATIVE_DEFAULT_BEFORE)),
      max: addDays(anchor, after ?? RELATIVE_DEFAULT_AFTER),
    };
  }

  return {};
}

/**
 * Push one attribute value through the validator stack useProtocolForm builds,
 * with the context the interview supplies.
 */
async function validateAttribute(options: {
  codebook: Codebook;
  network: NcNetwork;
  subject: StageSubject;
  variableId: string;
  variable: Variable;
  formValues: Record<string, FieldValue>;
  currentEntityId?: string;
}): Promise<string[]> {
  const { codebook, network, subject, variableId, variable, formValues } =
    options;
  const validation = 'validation' in variable ? variable.validation : undefined;

  const validationContext: ValidationContext = {
    codebook,
    network,
    stageSubject: subject,
    ...(options.currentEntityId !== undefined
      ? { currentEntityId: options.currentEntityId }
      : {}),
  };

  const props: Record<string, unknown> = {
    ...buildFieldValidationProps({
      type: variable.type,
      variable: variableId,
      ...(validation !== undefined ? { validation } : {}),
    }),
    ...datetimeBoundProps(variable),
    validationContext,
  };

  const result = await makeValidationFunction(props)(formValues).safeParseAsync(
    formValues[variableId],
  );

  return result.success
    ? []
    : result.error.issues.map((issue) => issue.message);
}

/**
 * Every ego, node and edge attribute in the network, validated against its
 * codebook variable. Collects the whole list rather than throwing on the first
 * failure, so one run reports every problem.
 */
async function collectFailures(
  codebook: Codebook,
  network: NcNetwork,
): Promise<string[]> {
  const failures: string[] = [];

  const checkEntity = async (
    subject: StageSubject,
    variables: Variables,
    attributes: Record<string, VariableValue>,
    label: string,
    currentEntityId?: string,
  ): Promise<void> => {
    const formValues = toFormValues(attributes);

    for (const [variableId, variable] of Object.entries(variables)) {
      const messages = await validateAttribute({
        codebook,
        network,
        subject,
        variableId,
        variable,
        formValues,
        ...(currentEntityId !== undefined ? { currentEntityId } : {}),
      });
      failures.push(
        ...messages.map((message) => `${label}.${variable.name}: ${message}`),
      );
    }
  };

  await checkEntity(
    { entity: 'ego' },
    codebook.ego?.variables ?? {},
    network.ego[entityAttributesProperty],
    'ego',
  );

  for (const node of network.nodes) {
    await checkEntity(
      { entity: 'node', type: node.type },
      codebook.node?.[node.type]?.variables ?? {},
      node[entityAttributesProperty],
      `node(${node.type})`,
      node[entityPrimaryKeyProperty],
    );
  }

  for (const edge of network.edges) {
    await checkEntity(
      { entity: 'edge', type: edge.type },
      codebook.edge?.[edge.type]?.variables ?? {},
      edge[entityAttributesProperty],
      `edge(${edge.type})`,
      edge[entityPrimaryKeyProperty],
    );
  }

  return failures;
}

const FOUR_OPTIONS: VariableOptions = [
  { label: 'Work', value: 'work' },
  { label: 'Home', value: 'home' },
  { label: 'School', value: 'school' },
  { label: 'Sport', value: 'sport' },
];

const THREE_OPTIONS: VariableOptions = [
  { label: 'Low', value: 1 },
  { label: 'Mid', value: 2 },
  { label: 'High', value: 3 },
];

const FIVE_OPTIONS: VariableOptions = [
  { label: 'Never', value: 1 },
  { label: 'Rarely', value: 2 },
  { label: 'Sometimes', value: 3 },
  { label: 'Often', value: 4 },
  { label: 'Always', value: 5 },
];

const MONTH_PARAMETERS = {
  type: 'month',
  min: '1950-01-01',
  max: '2005-12-31',
} as const;

/**
 * Every (variable type, validation rule) pair the ego entity may legally
 * declare, per the per-type `.pick()` lists in
 * `protocol-validation/src/schemas/8/variables/variable.ts`. Ego cannot declare
 * `unique`, which the node fixtures below cover instead.
 */
const egoVariables: Variables = {
  egoName: {
    name: 'Name',
    type: 'text',
    component: 'Text',
    validation: { required: true, minLength: 3, maxLength: 12 },
  },
  egoAlias: {
    name: 'Alias',
    type: 'text',
    component: 'Text',
    validation: { required: true, differentFrom: ref('egoName') },
  },
  // A length budget shorter than most of the words the generator draws from,
  // so a broken length fit shows up here rather than depending on which names
  // a seed happens to produce.
  egoInitials: {
    name: 'Initials',
    type: 'text',
    component: 'Text',
    validation: { required: true, minLength: 2, maxLength: 4 },
  },
  egoCode: {
    name: 'Code',
    type: 'text',
    component: 'Text',
    validation: { required: true, minLength: 8, maxLength: 8 },
  },
  egoCodeConfirm: {
    name: 'Confirm code',
    type: 'text',
    component: 'TextArea',
    validation: {
      required: true,
      minLength: 8,
      maxLength: 8,
      sameAs: ref('egoCode'),
    },
  },

  egoAge: {
    name: 'Age',
    type: 'number',
    component: 'Number',
    validation: { required: true, minValue: 18, maxValue: 65 },
  },
  egoAgeCopy: {
    name: 'Age again',
    type: 'number',
    validation: { minValue: 18, maxValue: 65, sameAs: ref('egoAge') },
  },
  egoYearsAtAddress: {
    name: 'Years at address',
    type: 'number',
    validation: { minValue: 0, maxValue: 40, lessThanVariable: ref('egoAge') },
  },
  egoRetirementAge: {
    name: 'Retirement age',
    type: 'number',
    validation: {
      minValue: 40,
      maxValue: 90,
      greaterThanVariable: ref('egoAge'),
    },
  },
  egoAgeAtLeast: {
    name: 'Age at least',
    type: 'number',
    validation: {
      minValue: 0,
      maxValue: 65,
      lessThanOrEqualToVariable: ref('egoAge'),
    },
  },
  egoAgeAtMost: {
    name: 'Age at most',
    type: 'number',
    validation: {
      minValue: 18,
      maxValue: 90,
      greaterThanOrEqualToVariable: ref('egoAge'),
    },
  },
  egoOtherNumber: {
    name: 'Other number',
    type: 'number',
    validation: { minValue: 1, maxValue: 3 },
  },
  egoLuckyNumber: {
    name: 'Lucky number',
    type: 'number',
    validation: {
      minValue: 1,
      maxValue: 3,
      differentFrom: ref('egoOtherNumber'),
    },
  },

  egoCloseness: {
    name: 'Closeness',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: { required: true, minValue: 0, maxValue: 1 },
  },
  egoTrust: {
    name: 'Trust',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: {
      minValue: 0,
      maxValue: 1,
      greaterThanVariable: ref('egoCloseness'),
    },
  },
  egoDoubt: {
    name: 'Doubt',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: {
      minValue: 0,
      maxValue: 1,
      lessThanVariable: ref('egoCloseness'),
    },
  },
  egoHopeAtLeast: {
    name: 'Hope at least',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: {
      minValue: 0,
      maxValue: 1,
      greaterThanOrEqualToVariable: ref('egoCloseness'),
    },
  },
  egoHopeAtMost: {
    name: 'Hope at most',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: {
      minValue: 0,
      maxValue: 1,
      lessThanOrEqualToVariable: ref('egoCloseness'),
    },
  },

  egoBirthMonth: {
    name: 'Birth month',
    type: 'datetime',
    component: 'DatePicker',
    parameters: MONTH_PARAMETERS,
    validation: { required: true },
  },
  egoBirthMonthCopy: {
    name: 'Birth month again',
    type: 'datetime',
    component: 'DatePicker',
    parameters: MONTH_PARAMETERS,
    validation: { sameAs: ref('egoBirthMonth') },
  },
  egoOtherMonth: {
    name: 'Other month',
    type: 'datetime',
    component: 'DatePicker',
    parameters: MONTH_PARAMETERS,
    validation: { differentFrom: ref('egoBirthMonth') },
  },
  egoLaterMonth: {
    name: 'Later month',
    type: 'datetime',
    component: 'DatePicker',
    parameters: MONTH_PARAMETERS,
    validation: { greaterThanVariable: ref('egoBirthMonth') },
  },
  egoEarlierMonth: {
    name: 'Earlier month',
    type: 'datetime',
    component: 'DatePicker',
    parameters: MONTH_PARAMETERS,
    validation: { lessThanVariable: ref('egoBirthMonth') },
  },
  egoMonthAtLeast: {
    name: 'Month at least',
    type: 'datetime',
    component: 'DatePicker',
    parameters: MONTH_PARAMETERS,
    validation: { greaterThanOrEqualToVariable: ref('egoBirthMonth') },
  },
  egoMonthAtMost: {
    name: 'Month at most',
    type: 'datetime',
    component: 'DatePicker',
    parameters: MONTH_PARAMETERS,
    validation: { lessThanOrEqualToVariable: ref('egoBirthMonth') },
  },
  egoStartYear: {
    name: 'Start year',
    type: 'datetime',
    component: 'DatePicker',
    parameters: { type: 'year', min: '1990-01-01', max: '2005-12-31' },
    validation: { required: true },
  },

  egoLastVisit: {
    name: 'Last visit',
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters: { before: 90, after: 0 },
    validation: { required: true },
  },
  egoLastVisitCopy: {
    name: 'Last visit again',
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters: { before: 90, after: 0 },
    validation: { sameAs: ref('egoLastVisit') },
  },
  egoOtherVisit: {
    name: 'Other visit',
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters: { before: 90, after: 0 },
    validation: { differentFrom: ref('egoLastVisit') },
  },
  egoFirstVisit: {
    name: 'First visit',
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters: { before: 365, after: 0 },
    validation: { lessThanVariable: ref('egoLastVisit') },
  },
  egoNextVisit: {
    name: 'Next visit',
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters: { before: 90, after: 30 },
    validation: { greaterThanVariable: ref('egoLastVisit') },
  },
  egoVisitAtLeast: {
    name: 'Visit at least',
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters: { before: 90, after: 30 },
    validation: { greaterThanOrEqualToVariable: ref('egoLastVisit') },
  },
  egoVisitAtMost: {
    name: 'Visit at most',
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters: { before: 120, after: 0 },
    validation: { lessThanOrEqualToVariable: ref('egoLastVisit') },
  },

  egoConsent: {
    name: 'Consent',
    type: 'boolean',
    component: 'Boolean',
    validation: { required: true },
  },
  egoConsentCopy: {
    name: 'Consent again',
    type: 'boolean',
    component: 'Boolean',
    validation: { sameAs: ref('egoConsent') },
  },
  egoRefused: {
    name: 'Refused',
    type: 'boolean',
    component: 'Boolean',
    validation: { differentFrom: ref('egoConsent') },
  },
  egoNotify: {
    name: 'Notify',
    type: 'boolean',
    component: 'Toggle',
    validation: { required: true },
  },
  egoNotifyCopy: {
    name: 'Notify again',
    type: 'boolean',
    component: 'Toggle',
    validation: { sameAs: ref('egoNotify') },
  },
  egoOptOut: {
    name: 'Opt out',
    type: 'boolean',
    component: 'Toggle',
    validation: { differentFrom: ref('egoNotify') },
  },

  egoBand: {
    name: 'Band',
    type: 'ordinal',
    component: 'RadioGroup',
    options: THREE_OPTIONS,
    validation: { required: true },
  },
  egoBandCopy: {
    name: 'Band again',
    type: 'ordinal',
    component: 'RadioGroup',
    options: THREE_OPTIONS,
    validation: { sameAs: ref('egoBand') },
  },
  egoOtherBand: {
    name: 'Other band',
    type: 'ordinal',
    component: 'RadioGroup',
    options: THREE_OPTIONS,
    validation: { differentFrom: ref('egoBand') },
  },
  egoFrequency: {
    name: 'Frequency',
    type: 'ordinal',
    component: 'LikertScale',
    options: FIVE_OPTIONS,
    validation: { required: true },
  },

  egoContexts: {
    name: 'Contexts',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: FOUR_OPTIONS,
    validation: { required: true, minSelected: 2, maxSelected: 3 },
  },
  egoContextsCopy: {
    name: 'Contexts again',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: FOUR_OPTIONS,
    validation: { sameAs: ref('egoContexts') },
  },
  egoOtherContexts: {
    name: 'Other contexts',
    type: 'categorical',
    component: 'ToggleButtonGroup',
    options: FOUR_OPTIONS,
    validation: { required: true, differentFrom: ref('egoContexts') },
  },
};

/**
 * `unique` for every type that accepts it and can hold six distinct values,
 * alongside the rest of the rule set on a node subject.
 */
const personVariables: Variables = {
  personName: {
    name: 'Person name',
    type: 'text',
    component: 'Text',
    validation: { required: true, minLength: 2, maxLength: 20 },
  },
  personTag: {
    name: 'Person tag',
    type: 'text',
    component: 'Text',
    validation: { required: true, minLength: 2, maxLength: 4 },
  },
  personCode: {
    name: 'Person code',
    type: 'text',
    component: 'Text',
    validation: { required: true, unique: true, minLength: 6, maxLength: 6 },
  },
  personCodeCopy: {
    name: 'Person code again',
    type: 'text',
    component: 'Text',
    validation: { minLength: 6, maxLength: 6, sameAs: ref('personCode') },
  },
  personNickname: {
    name: 'Person nickname',
    type: 'text',
    component: 'Text',
    validation: { required: true, differentFrom: ref('personName') },
  },
  personAge: {
    name: 'Person age',
    type: 'number',
    component: 'Number',
    validation: { required: true, unique: true, minValue: 18, maxValue: 80 },
  },
  personYearsKnown: {
    name: 'Years known',
    type: 'number',
    validation: {
      minValue: 0,
      maxValue: 60,
      lessThanVariable: ref('personAge'),
    },
  },
  personCloseness: {
    name: 'Person closeness',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: { required: true, minValue: 0, maxValue: 1 },
  },
  personMet: {
    name: 'Met on',
    type: 'datetime',
    component: 'DatePicker',
    parameters: { type: 'month', min: '2000-01-01', max: '2024-12-31' },
    validation: { required: true, unique: true },
  },
  personLastSeen: {
    name: 'Last seen',
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters: { before: 90, after: 0 },
    validation: { required: true, unique: true },
  },
  personContexts: {
    name: 'Person contexts',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: FOUR_OPTIONS,
    validation: {
      required: true,
      unique: true,
      minSelected: 1,
      maxSelected: 3,
    },
  },
  personBand: {
    name: 'Person band',
    type: 'ordinal',
    component: 'RadioGroup',
    options: THREE_OPTIONS,
    validation: { required: true },
  },
  personLayout: { name: 'Person layout', type: 'layout' },
  personPlace: { name: 'Person place', type: 'location' },
};

/**
 * `unique` on the types whose value space is too small for six entities:
 * boolean holds two values and this ordinal four, so the stage that creates
 * them is capped at two nodes.
 */
const tokenVariables: Variables = {
  tokenFlag: {
    name: 'Token flag',
    type: 'boolean',
    component: 'Boolean',
    validation: { required: true, unique: true },
  },
  tokenSwitch: {
    name: 'Token switch',
    type: 'boolean',
    component: 'Toggle',
    validation: { required: true, unique: true },
  },
  tokenRank: {
    name: 'Token rank',
    type: 'ordinal',
    component: 'RadioGroup',
    options: FOUR_OPTIONS,
    validation: { required: true, unique: true },
  },
  tokenRankCopy: {
    name: 'Token rank again',
    type: 'ordinal',
    component: 'RadioGroup',
    options: FOUR_OPTIONS,
    validation: { sameAs: ref('tokenRank') },
  },
  tokenOtherRank: {
    name: 'Token other rank',
    type: 'ordinal',
    component: 'RadioGroup',
    options: FOUR_OPTIONS,
    validation: { required: true, differentFrom: ref('tokenRank') },
  },
};

const friendVariables: Variables = {
  edgeLabel: {
    name: 'Edge label',
    type: 'text',
    component: 'Text',
    validation: { required: true, unique: true, minLength: 4, maxLength: 8 },
  },
  edgeNote: {
    name: 'Edge note',
    type: 'text',
    component: 'TextArea',
    validation: { required: true, differentFrom: ref('edgeLabel') },
  },
  edgeStrength: {
    name: 'Edge strength',
    type: 'number',
    component: 'Number',
    validation: { required: true, minValue: 1, maxValue: 5 },
  },
  edgeWeight: {
    name: 'Edge weight',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: { required: true, minValue: 0, maxValue: 1 },
  },
  edgeSince: {
    name: 'Edge since',
    type: 'datetime',
    component: 'DatePicker',
    parameters: { type: 'year', min: '2000-01-01', max: '2024-12-31' },
    validation: { required: true },
  },
  edgeSinceCopy: {
    name: 'Edge since again',
    type: 'datetime',
    component: 'DatePicker',
    parameters: { type: 'year', min: '2000-01-01', max: '2024-12-31' },
    validation: { sameAs: ref('edgeSince') },
  },
  edgeIsClose: {
    name: 'Edge is close',
    type: 'boolean',
    component: 'Boolean',
    validation: { required: true },
  },
  edgeKind: {
    name: 'Edge kind',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: THREE_OPTIONS,
    validation: { required: true, minSelected: 1, maxSelected: 2 },
  },
};

const codebook: Codebook = {
  ego: { variables: egoVariables },
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: personVariables,
    },
    token: {
      name: 'Token',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: tokenVariables,
    },
  },
  edge: {
    friend: {
      name: 'Friend',
      color: 'edge-color-seq-1',
      variables: friendVariables,
    },
  },
};

// Stage literals are deliberately partial: generation reads only the fields
// below, and spelling out every author-facing field (introduction panels, form
// titles, prompt colours) would bury what each fixture is actually exercising.
const stages = [
  {
    id: 'stage-ego',
    type: 'EgoForm',
    label: 'About you',
    form: {
      fields: Object.keys(egoVariables).map((variable) => ({ variable })),
    },
  },
  {
    id: 'stage-people',
    type: 'NameGenerator',
    label: 'People',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Name people' }],
    behaviours: { minNodes: 6, maxNodes: 6 },
  },
  {
    id: 'stage-tokens',
    type: 'NameGenerator',
    label: 'Tokens',
    subject: { entity: 'node', type: 'token' },
    prompts: [{ id: 'p2', text: 'Name tokens' }],
    behaviours: { minNodes: 2, maxNodes: 2 },
  },
  {
    id: 'stage-sociogram',
    type: 'Sociogram',
    label: 'Connections',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      {
        id: 'p3',
        text: 'Connect people',
        layout: { layoutVariable: 'personLayout' },
        edges: { create: 'friend' },
      },
    ],
  },
] as unknown as Stage[];

describe('synthetic data conformance', () => {
  it('generates values that pass the real form validators for every legal rule', async () => {
    const { network } = generateNetwork({
      seed: 11,
      codebook,
      stages,
      config: { today },
    });

    expect(network.nodes.filter((node) => node.type === 'person')).toHaveLength(
      6,
    );
    expect(network.nodes.filter((node) => node.type === 'token')).toHaveLength(
      2,
    );
    expect(network.edges.length).toBeGreaterThan(0);

    expect(await collectFailures(codebook, network)).toEqual([]);
  });

  it('holds for every seed in a run of ten', async () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= 10; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages,
        config: { today },
      });
      failures.push(
        ...(await collectFailures(codebook, network)).map(
          (failure) => `seed ${seed}: ${failure}`,
        ),
      );
    }

    expect(failures).toEqual([]);
  });
});

// A binned variable and the variable it is ruled against, so a bin stage's
// direct write can be seen defeating a cross-variable rule.
const binVariables: Variables = {
  binBand: {
    name: 'Bin band',
    type: 'ordinal',
    component: 'RadioGroup',
    options: THREE_OPTIONS,
    validation: { required: true },
  },
  binOther: {
    name: 'Bin other',
    type: 'ordinal',
    component: 'RadioGroup',
    options: THREE_OPTIONS,
    validation: { required: true, differentFrom: ref('binBand') },
  },
  binContexts: {
    name: 'Bin contexts',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: FOUR_OPTIONS,
    validation: { required: true, minSelected: 2, maxSelected: 3 },
  },
  binTwin: {
    name: 'Bin twin',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: FOUR_OPTIONS,
    validation: { required: true, sameAs: ref('binContexts') },
  },
};

const binCodebook: Codebook = {
  node: {
    binned: {
      name: 'Binned',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: binVariables,
    },
  },
};

const binNameGenerator = {
  id: 'stage-binned',
  type: 'NameGenerator',
  label: 'Binned people',
  subject: { entity: 'node', type: 'binned' },
  prompts: [{ id: 'p1', text: 'Name people' }],
  behaviours: { minNodes: 8, maxNodes: 8 },
};

const binGeneratorOnly = [binNameGenerator] as unknown as Stage[];

const binStages = [
  binNameGenerator,
  {
    id: 'stage-ordinal-bin',
    type: 'OrdinalBin',
    label: 'Ordinal bin',
    subject: { entity: 'node', type: 'binned' },
    prompts: [{ id: 'p2', text: 'Sort', variable: 'binOther' }],
  },
  {
    id: 'stage-categorical-bin',
    type: 'CategoricalBin',
    label: 'Categorical bin',
    subject: { entity: 'node', type: 'binned' },
    prompts: [{ id: 'p3', text: 'Sort', variable: 'binTwin' }],
  },
] as unknown as Stage[];

/**
 * Counts nodes whose attributes fail validation across ten seeds, so the two
 * tests below compare the same protocol with and without its bin stages.
 */
async function countViolatingNodes(stageList: Stage[]): Promise<number> {
  let violating = 0;

  for (let seed = 1; seed <= 10; seed++) {
    const { network } = generateNetwork({
      seed,
      codebook: binCodebook,
      stages: stageList,
      config: { today },
    });

    for (const node of network.nodes) {
      const failures: string[] = [];
      const formValues = toFormValues(node[entityAttributesProperty]);
      for (const [variableId, variable] of Object.entries(binVariables)) {
        failures.push(
          ...(await validateAttribute({
            codebook: binCodebook,
            network,
            subject: { entity: 'node', type: node.type },
            variableId,
            variable,
            formValues,
            currentEntityId: node[entityPrimaryKeyProperty],
          })),
        );
      }
      if (failures.length > 0) violating += 1;
    }
  }

  return violating;
}

describe('known gap: bin stages bypass the constrained draw', () => {
  it('satisfies the same rules when no bin stage touches the variables', async () => {
    expect(await countViolatingNodes(binGeneratorOnly)).toBe(0);
  });

  // handleOrdinalBin and handleCategoricalBin in
  // packages/protocol-utilities/src/generateNetwork/stageHandlers.ts assign
  // their prompt's variable straight from the option list, bypassing
  // generateEntityAttributes, so any cross-variable rule on a binned variable
  // is defeated. Of the 80 nodes this fixture generates, 0 violate their rules
  // without a bin stage, 24 with the OrdinalBin alone, 76 with the
  // CategoricalBin alone and 80 with both. Recorded rather than avoided: once
  // the handlers route through the constrained path this test fails, which is
  // the signal to delete it and fold the fixture into the suite above.
  it('loses those rules once the bin stages run', async () => {
    expect(await countViolatingNodes(binStages)).toBeGreaterThan(0);
  });
});
