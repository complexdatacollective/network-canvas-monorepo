import { describe, expect, it } from 'vitest';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import { todayYmd } from '@codaco/fresco-ui/form/utils/ymd';
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

import { buildDatePickerBoundProps } from '../buildDatePickerBoundProps';
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
    // useProtocolForm turns a datetime variable's picker parameters into
    // min/max validators — absolute for DatePicker, anchor-relative for
    // RelativeDatePicker. Those are the only validators that bound a date, so
    // a conformance check that omitted them would leave every generated date
    // unchecked. `variable` is a union where non-datetime members don't
    // declare `component`/`parameters` at all, hence the `in` guards.
    ...buildDatePickerBoundProps({
      component: 'component' in variable ? variable.component : undefined,
      parameters: 'parameters' in variable ? variable.parameters : undefined,
    }),
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
 * The variables a protocol puts inside a rendered form field, keyed by node or
 * edge type.
 *
 * A validation rule is a form-field mechanism: the interview enforces one only
 * where `useProtocolForm` builds a field for the variable. Interaction-driven
 * stages write attributes without a field — a binning stage assigns its prompt
 * variable by drag, a Sociogram writes a layout variable by drop — so this set
 * is what a conformance assertion is entitled to check.
 */
type FormScope = {
  ego: Set<string>;
  node: Map<string, Set<string>>;
  edge: Map<string, Set<string>>;
};

function addScopedVariables(
  scoped: Map<string, Set<string>>,
  type: string,
  variables: string[],
): void {
  const forType = scoped.get(type) ?? new Set<string>();
  for (const variable of variables) forType.add(variable);
  scoped.set(type, forType);
}

function collectFormScope(stageList: Stage[]): FormScope {
  const scope: FormScope = { ego: new Set(), node: new Map(), edge: new Map() };

  for (const stage of stageList) {
    // NetworkComposer keeps its field lists on the stage rather than under a
    // `form` key: one for the node inspector, one per drawable edge type.
    if (stage.type === 'NetworkComposer') {
      addScopedVariables(
        scope.node,
        stage.subject.type,
        (stage.nodeForm?.fields ?? []).map((field) => field.variable),
      );
      for (const edge of stage.edges ?? []) {
        addScopedVariables(
          scope.edge,
          edge.subject.type,
          (edge.form?.fields ?? []).map((field) => field.variable),
        );
      }
      continue;
    }

    if (!('form' in stage)) continue;
    const variables = stage.form.fields.map((field) => field.variable);

    if (stage.type === 'EgoForm') {
      for (const variable of variables) scope.ego.add(variable);
      continue;
    }

    if (stage.subject.entity === 'node') {
      addScopedVariables(scope.node, stage.subject.type, variables);
    } else {
      addScopedVariables(scope.edge, stage.subject.type, variables);
    }
  }

  return scope;
}

/**
 * Node and edge subject types the form-scope guard confirms are validated,
 * but that produced zero entities in a generated network. Scope alone can't
 * see this: a type nothing was generated for never reaches `checkEntity`, so
 * it would pass the scope check while contributing nothing to the proof.
 *
 * Ego is not checked here — the network schema always carries exactly one
 * ego entity, so it has no "zero generated" case to guard against.
 */
function emptyFixtureEntityTypes(
  scope: FormScope,
  network: NcNetwork,
): string[] {
  const empty: string[] = [];

  for (const type of scope.node.keys()) {
    if (!network.nodes.some((node) => node.type === type)) {
      empty.push(`node(${type})`);
    }
  }

  for (const type of scope.edge.keys()) {
    if (!network.edges.some((edge) => edge.type === type)) {
      empty.push(`edge(${type})`);
    }
  }

  return empty;
}

/**
 * Every form-rendered ego, node and edge attribute in the network, validated
 * against its codebook variable. Collects the whole list rather than throwing
 * on the first failure, so one run reports every problem.
 */
async function collectFailures(
  codebook: Codebook,
  network: NcNetwork,
  stageList: Stage[],
): Promise<string[]> {
  const scope = collectFormScope(stageList);
  const failures: string[] = [];

  const checkEntity = async (
    subject: StageSubject,
    variables: Variables,
    scoped: Set<string> | undefined,
    attributes: Record<string, VariableValue>,
    label: string,
    currentEntityId?: string,
  ): Promise<void> => {
    if (scoped === undefined) return;

    const formValues = toFormValues(attributes);

    for (const [variableId, variable] of Object.entries(variables)) {
      if (!scoped.has(variableId)) continue;

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
    scope.ego,
    network.ego[entityAttributesProperty],
    'ego',
  );

  for (const node of network.nodes) {
    await checkEntity(
      { entity: 'node', type: node.type },
      codebook.node?.[node.type]?.variables ?? {},
      scope.node.get(node.type),
      node[entityAttributesProperty],
      `node(${node.type})`,
      node[entityPrimaryKeyProperty],
    );
  }

  for (const edge of network.edges) {
    await checkEntity(
      { entity: 'edge', type: edge.type },
      codebook.edge?.[edge.type]?.variables ?? {},
      scope.edge.get(edge.type),
      edge[entityAttributesProperty],
      `edge(${edge.type})`,
      edge[entityPrimaryKeyProperty],
    );
  }

  return failures;
}

/**
 * Form fields for every variable a form can render. Layout and location
 * variables have no participant-facing control, so no form lists them.
 */
function formFields(variables: Variables): { variable: string }[] {
  return Object.entries(variables)
    .filter(
      ([, variable]) =>
        variable.type !== 'layout' && variable.type !== 'location',
    )
    .map(([variableId]) => ({ variable: variableId }));
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

  // Scalar takes `required` and the four comparison rules, and nothing else: a
  // response is recorded on a normalised 0-1 scale, so the type declares no
  // value bounds of its own. Every rule it does accept is below.
  egoCloseness: {
    name: 'Closeness',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: { required: true },
  },
  egoTrust: {
    name: 'Trust',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: { greaterThanVariable: ref('egoCloseness') },
  },
  egoDoubt: {
    name: 'Doubt',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: { lessThanVariable: ref('egoCloseness') },
  },
  egoHopeAtLeast: {
    name: 'Hope at least',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: { greaterThanOrEqualToVariable: ref('egoCloseness') },
  },
  egoHopeAtMost: {
    name: 'Hope at most',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: { lessThanOrEqualToVariable: ref('egoCloseness') },
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
    validation: { required: true },
  },
  personRegard: {
    name: 'Person regard',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: { greaterThanVariable: ref('personCloseness') },
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
  // No `before`/`after`: every other RelativeDatePicker fixture sets both
  // explicitly, which never reaches buildDatePickerBoundProps's own defaults
  // (180 days before today, 0 after). A researcher who leaves the window
  // unconfigured gets exactly this — Architect's parameter form describes
  // both as defaults rather than requiring them (see
  // apps/architect/src/components/Parameters/RelativeDatePicker.tsx) — so
  // this fixture is what most real protocols exercise.
  personDefaultVisit: {
    name: 'Person default visit',
    type: 'datetime',
    component: 'RelativeDatePicker',
    parameters: {},
    validation: { required: true },
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
    validation: { required: true },
  },
  edgeWeightFloor: {
    name: 'Edge weight floor',
    type: 'scalar',
    component: 'VisualAnalogScale',
    validation: { lessThanOrEqualToVariable: ref('edgeWeight') },
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
//
// Every rule-bearing variable above sits in one of these forms, because a
// variable no form renders is a variable the interview never validates. The
// name generators carry their node forms, an AlterEdgeForm carries the edge
// form the Sociogram's edges would otherwise never reach.
const stages = [
  {
    id: 'stage-ego',
    type: 'EgoForm',
    label: 'About you',
    form: { fields: formFields(egoVariables) },
  },
  {
    id: 'stage-people',
    type: 'NameGenerator',
    label: 'People',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Name people' }],
    form: { title: 'About this person', fields: formFields(personVariables) },
    behaviours: { minNodes: 6, maxNodes: 6 },
  },
  {
    id: 'stage-tokens',
    type: 'NameGenerator',
    label: 'Tokens',
    subject: { entity: 'node', type: 'token' },
    prompts: [{ id: 'p2', text: 'Name tokens' }],
    form: { title: 'About this token', fields: formFields(tokenVariables) },
    behaviours: { minNodes: 2, maxNodes: 2 },
  },
  {
    id: 'stage-sociogram',
    type: 'Sociogram',
    label: 'Connections',
    subject: { entity: 'node', type: 'person' },
    // Two edge-creating prompts over the same six people: each prompt draws
    // its own per-pair probability and rolls every pair against it, so a
    // second pass is a second, independent chance for a pair the first pass
    // left unconnected. One prompt alone can and does land on a single edge
    // at some seeds (weakness 1 in the review), which leaves `unique` on an
    // edge variable with no peer to collide with.
    prompts: [
      {
        id: 'p3',
        text: 'Connect people',
        layout: { layoutVariable: 'personLayout' },
        edges: { create: 'friend' },
      },
      {
        id: 'p3b',
        text: 'Connect people again',
        layout: { layoutVariable: 'personLayout' },
        edges: { create: 'friend' },
      },
    ],
  },
  {
    id: 'stage-connections',
    type: 'AlterEdgeForm',
    label: 'About connections',
    subject: { entity: 'edge', type: 'friend' },
    form: { fields: formFields(friendVariables) },
  },
] as unknown as Stage[];

describe('synthetic data conformance', () => {
  // The assertions below only look at form-rendered variables, so a fixture
  // variable that no stage's form lists would be quietly dropped from the
  // matrix rather than failing. Pinned so shrinking the coverage takes a
  // deliberate edit here.
  //
  // Scope is necessary but not sufficient: a fixture node or edge type that
  // generated zero entities would still pass the scope check, having
  // contributed nothing to the proof (weakness 3 in the review). The second
  // half of this test generates a network and confirms every scoped node/edge
  // type actually produced at least one entity.
  it('renders every rule-bearing fixture variable in a form, and every fixture entity type is populated', async () => {
    const scope = collectFormScope(stages);
    const unchecked: string[] = [];

    const check = (
      variables: Variables,
      scoped: Set<string> | undefined,
      label: string,
    ): void => {
      for (const [variableId, variable] of Object.entries(variables)) {
        if (!('validation' in variable)) continue;
        if (scoped?.has(variableId)) continue;
        unchecked.push(`${label}.${variableId}`);
      }
    };

    check(egoVariables, scope.ego, 'ego');
    check(personVariables, scope.node.get('person'), 'person');
    check(tokenVariables, scope.node.get('token'), 'token');
    check(friendVariables, scope.edge.get('friend'), 'friend');

    expect(unchecked).toEqual([]);

    const { network } = generateNetwork({
      seed: 11,
      codebook,
      stages,
      config: { today },
    });

    expect(emptyFixtureEntityTypes(scope, network)).toEqual([]);
  });

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
    // >= 2, not just > 0: a single edge leaves `unique` on an edge variable
    // with no peer to collide with, so it would pass trivially rather than
    // being exercised (weakness 1 in the review). The Sociogram stage above
    // runs two edge-creating prompts specifically so this holds comfortably.
    expect(network.edges.length).toBeGreaterThanOrEqual(2);

    expect(await collectFailures(codebook, network, stages)).toEqual([]);
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
        ...(await collectFailures(codebook, network, stages)).map(
          (failure) => `seed ${seed}: ${failure}`,
        ),
      );
    }

    expect(failures).toEqual([]);
  });
});

/**
 * A protocol shape that is hazardous to author: `binRank` and `binContexts` are
 * listed in the name generator's form — so the interview builds a validated
 * field for each — and are also the prompt variables of the bin stages that
 * follow.
 *
 * Neither bin interface renders a field for its prompt variable. OrdinalBin
 * renders no `Field` at all, and CategoricalBin renders one only for a prompt's
 * `otherVariable`; both write the prompt variable straight through `updateNode`
 * when a node is dropped. So a value the form validated is later replaced by
 * one nothing validates, and the participant is never told.
 *
 * Generation cannot repair this, and should not try. A bin exists so that a
 * participant may put any node in any bin: `differentFrom` on a binned variable
 * forbids two nodes sharing a bin, and `minSelected: 2` forbids a node sitting
 * in exactly one. Constraining the generator to satisfy those rules would make
 * it emit arrangements the interface cannot produce. Keeping a validated
 * variable out of a bin prompt is a protocol-authoring decision. The test below
 * therefore measures the hazard rather than asserting it away.
 */
const hazardVariables: Variables = {
  binBand: {
    name: 'Bin band',
    type: 'ordinal',
    component: 'RadioGroup',
    options: THREE_OPTIONS,
    validation: { required: true },
  },
  binRank: {
    name: 'Bin rank',
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
};

const hazardCodebook: Codebook = {
  node: {
    binned: {
      name: 'Binned',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: hazardVariables,
    },
  },
};

const hazardFormStage = {
  id: 'stage-binned',
  type: 'NameGenerator',
  label: 'Binned people',
  subject: { entity: 'node', type: 'binned' },
  prompts: [{ id: 'p1', text: 'Name people' }],
  form: { title: 'About this person', fields: formFields(hazardVariables) },
  behaviours: { minNodes: 8, maxNodes: 8 },
};

const hazardFormOnlyStages = [hazardFormStage] as unknown as Stage[];

const hazardFormAndBinStages = [
  hazardFormStage,
  {
    id: 'stage-ordinal-bin',
    type: 'OrdinalBin',
    label: 'Ordinal bin',
    subject: { entity: 'node', type: 'binned' },
    prompts: [{ id: 'p2', text: 'Sort', variable: 'binRank' }],
  },
  {
    id: 'stage-categorical-bin',
    type: 'CategoricalBin',
    label: 'Categorical bin',
    subject: { entity: 'node', type: 'binned' },
    prompts: [{ id: 'p3', text: 'Sort', variable: 'binContexts' }],
  },
] as unknown as Stage[];

type HazardMeasurement = { nodes: number; violatingNodes: number };

/**
 * Nodes whose form-rendered attributes fail their rules, across ten seeds. The
 * scope is the name generator's form either way, so the two stage lists are
 * measured against exactly the same fields.
 */
async function measureHazard(stageList: Stage[]): Promise<HazardMeasurement> {
  const measurement: HazardMeasurement = { nodes: 0, violatingNodes: 0 };

  for (let seed = 1; seed <= 10; seed++) {
    const { network } = generateNetwork({
      seed,
      codebook: hazardCodebook,
      stages: stageList,
      config: { today },
    });

    for (const node of network.nodes) {
      measurement.nodes += 1;

      const formValues = toFormValues(node[entityAttributesProperty]);
      let violated = false;
      for (const [variableId, variable] of Object.entries(hazardVariables)) {
        const messages = await validateAttribute({
          codebook: hazardCodebook,
          network,
          subject: { entity: 'node', type: node.type },
          variableId,
          variable,
          formValues,
          currentEntityId: node[entityPrimaryKeyProperty],
        });
        if (messages.length > 0) violated = true;
      }
      if (violated) measurement.violatingNodes += 1;
    }
  }

  return measurement;
}

describe('a variable used by both a form and a binning stage', () => {
  it('conforms while only the form writes it', async () => {
    const measurement = await measureHazard(hazardFormOnlyStages);

    expect(measurement.nodes).toBe(80);
    expect(measurement.violatingNodes).toBe(0);
  });

  // Not a defect to fix in generation: the bin stages write the values a
  // participant's drags would write, and those are the values the form's rules
  // reject. The count is left unpinned because it is a property of the fixture's
  // option counts, not a contract.
  it('stops conforming once the bin stages write it', async () => {
    const measurement = await measureHazard(hazardFormAndBinStages);

    expect(measurement.nodes).toBe(80);
    expect(measurement.violatingNodes).toBeGreaterThan(0);
  });

  // Conformance alone would be satisfied by a handler that wrote nothing, and a
  // bin stage that sorts no node into a bin is not the interaction it stands
  // for. Every subject node still holds a value of each prompt's variable.
  it('sorts every subject node into a bin', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook: hazardCodebook,
      stages: hazardFormAndBinStages,
      config: { today },
    });

    expect(network.nodes).toHaveLength(8);

    const ordinalValues = THREE_OPTIONS.map((option) => option.value);
    const categoricalValues = FOUR_OPTIONS.map((option) => option.value);

    for (const node of network.nodes) {
      const attributes = node[entityAttributesProperty];
      expect(ordinalValues).toContain(attributes.binRank);
      expect(Array.isArray(attributes.binContexts)).toBe(true);
      for (const value of Array.isArray(attributes.binContexts)
        ? attributes.binContexts
        : []) {
        expect(categoricalValues).toContain(value);
      }
    }
  });
});
