import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import { makeValidationFunction } from '@codaco/fresco-ui/form/validation/helpers';
import {
  type Codebook,
  type CurrentProtocol,
  CurrentProtocolSchema,
  type StageSubject,
  type Variable,
  VARIABLE_REFERENCE_VALIDATIONS,
  type Variables,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateCorpusProtocol } from '../corpus';
import { generateInterviews } from '../index';
import type { AssetData } from '../simulators/types';

/**
 * Criterion C3 — validation conformance, through the runtime's own validator.
 *
 * The engine decides what a value may be by reading the codebook itself. That
 * reading is only worth anything if it agrees with the reading the PARTICIPANT'S
 * FORM makes, so this test never re-implements a rule: it hands every generated
 * value to `makeValidationFunction`, the exact function `useField` calls, under
 * the same `ValidationContext` an interview builds — the live network, the
 * entity being edited, and its own attributes.
 *
 * A generator that drifts from the runtime — a boundary read as inclusive on
 * one side and exclusive on the other, a `unique` slot the draw thought it had
 * freed — shows up here as a value the real form would have rejected under the
 * participant's nose.
 */

const START_WINDOW = '2026-08-14T12:00:00.000Z';

const comparisonRules = VARIABLE_REFERENCE_VALIDATIONS.filter(
  (
    rule,
  ): rule is Exclude<
    (typeof VARIABLE_REFERENCE_VALIDATIONS)[number],
    'sameAs' | 'differentFrom'
  > => rule !== 'sameAs' && rule !== 'differentFrom',
);

const validationRecord = (
  variable: Variable,
): Readonly<Record<string, unknown>> => {
  if (!('validation' in variable) || variable.validation === undefined) {
    return {};
  }
  return variable.validation;
};

/**
 * A codebook variable as the props a rendered field would carry.
 *
 * Kept verbatim from the analyser-to-runtime conformance oracle it replaces:
 * the runtime's `unique` validator takes the variable's ID rather than a
 * boolean, its comparison validators take `{ attribute, type }`, and a
 * DatePicker's window arrives as `min`/`max` props rather than as parameters.
 */
const runtimeValidationProps = (
  variableId: string,
  variable: Variable,
  context: ValidationContext,
): Record<string, unknown> => {
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
};

type Failure = {
  where: string;
  variable: string;
  value: string;
  issue: string;
};

/**
 * Every value one entity holds, put through the real validator.
 *
 * Values the entity does NOT hold are skipped rather than validated as empty:
 * a stage collects the fields its own form declares, so a variable no stage
 * asked about is absent by design, and `required` is a claim about a field a
 * participant was shown rather than about the codebook at large.
 */
const validateEntity = async ({
  variables,
  attributes,
  entityId,
  stageSubject,
  codebook,
  network,
  where,
}: {
  variables: Variables | undefined;
  attributes: Record<string, VariableValue>;
  entityId: string;
  stageSubject: StageSubject;
  codebook: Codebook;
  network: NcNetwork;
  where: string;
}): Promise<Failure[]> => {
  const failures: Failure[] = [];
  const context: ValidationContext = {
    stageSubject,
    codebook,
    network,
    currentEntityId: entityId,
    currentEntityAttributes: attributes,
  };

  for (const [variableId, variable] of Object.entries(variables ?? {})) {
    const value = attributes[variableId];
    if (value === undefined || value === null) continue;

    const result = await makeValidationFunction(
      runtimeValidationProps(variableId, variable, context),
    )(attributes).safeParseAsync(value);

    if (!result.success) {
      failures.push({
        where,
        variable: variableId,
        value: JSON.stringify(value),
        issue: result.error.issues.map((issue) => issue.message).join('; '),
      });
    }
  }

  return failures;
};

/** Every entity of one generated session, validated as the runtime would. */
const validateSession = async (
  protocol: CurrentProtocol,
  network: NcNetwork,
  label: string,
): Promise<Failure[]> => {
  const codebook: Codebook = protocol.codebook;
  const failures: Failure[] = [];

  for (const node of network.nodes) {
    failures.push(
      ...(await validateEntity({
        variables: codebook.node?.[node.type]?.variables,
        attributes: node[entityAttributesProperty],
        entityId: node[entityPrimaryKeyProperty],
        stageSubject: { entity: 'node', type: node.type },
        codebook,
        network,
        where: `${label} node ${node.type}`,
      })),
    );
  }

  for (const edge of network.edges) {
    failures.push(
      ...(await validateEntity({
        variables: codebook.edge?.[edge.type]?.variables,
        attributes: edge[entityAttributesProperty],
        entityId: edge[entityPrimaryKeyProperty],
        stageSubject: { entity: 'edge', type: edge.type },
        codebook,
        network,
        where: `${label} edge ${edge.type}`,
      })),
    );
  }

  // Ego is validated for everything except `unique`, which the runtime refuses
  // to apply to a single entity — `runtimeValidationProps` passes the rule on
  // and the validator's own invariant would throw, so the codebook's ego
  // variables are read without it. No bundled protocol declares one.
  const ego = network.ego;
  if (ego) {
    failures.push(
      ...(await validateEntity({
        variables: codebook.ego?.variables,
        attributes: ego[entityAttributesProperty],
        entityId: ego[entityPrimaryKeyProperty],
        stageSubject: { entity: 'ego' },
        codebook,
        network,
        where: `${label} ego`,
      })),
    );
  }

  return failures;
};

const sessionsFor = (
  protocol: CurrentProtocol,
  seeds: number,
  assetData?: AssetData,
): NcNetwork[] =>
  Array.from({ length: seeds }, (_unused, seed) => {
    const [result] = generateInterviews(
      protocol,
      { count: 1, seed, simulateDropOut: false, startWindow: START_WINDOW },
      assetData,
    );
    const network = result?.session.network;
    if (network === undefined)
      throw new Error('generation produced no network');
    return network;
  });

const bundled = (file: string): CurrentProtocol =>
  CurrentProtocolSchema.parse(
    JSON.parse(
      readFileSync(
        path.resolve(import.meta.dirname, '../../../../protocols', file),
        'utf8',
      ),
    ) as unknown,
  );

describe('generated values pass the runtime’s own field validation (C3)', () => {
  it.each([
    ['development', 'development/protocol.json'],
    ['sample', 'sample/protocol.json'],
    ['synthetic showcase', 'e2e/synthetic-showcase/protocol.json'],
  ])(
    'the %s protocol',
    async (name, file) => {
      const protocol = bundled(file);
      const failures: Failure[] = [];
      let entities = 0;

      for (const [seed, network] of sessionsFor(protocol, 3).entries()) {
        entities += network.nodes.length + network.edges.length;
        failures.push(
          ...(await validateSession(protocol, network, `${name} seed ${seed}`)),
        );
      }

      // Not vacuous: a protocol that generated nobody would pass silently.
      expect(entities).toBeGreaterThan(50);
      expect(failures).toEqual([]);
    },
    120_000,
  );

  it('every accepted corpus shape', { timeout: 300_000 }, async () => {
    const failures: Failure[] = [];
    let validated = 0;

    for (let index = 0; index < 80; index += 1) {
      const { protocol, assetData, shape } = generateCorpusProtocol(index);

      let networks: NcNetwork[];
      try {
        networks = sessionsFor(protocol, 2, assetData);
      } catch {
        // A refused shape has nothing to validate; the corpus test owns the
        // claim that its refusal is the right one.
        continue;
      }

      for (const [seed, network] of networks.entries()) {
        validated += network.nodes.length + network.edges.length;
        failures.push(
          ...(await validateSession(
            protocol,
            network,
            `shape ${shape.index} seed ${seed}`,
          )),
        );
      }
    }

    expect(validated).toBeGreaterThan(200);
    expect(failures).toEqual([]);
  });
});
