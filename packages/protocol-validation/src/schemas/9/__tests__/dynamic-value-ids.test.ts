import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { testId, testVariableId } from '../../../__tests__/testIds.ts';
import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import { collectProtocolObjectIds } from '../../../utils/collectProtocolObjectIds.ts';
import { freshenProtocolFragmentIds } from '../../../utils/freshenProtocolFragmentIds.ts';
import {
  dynamicValueNameFor,
  dynamicValueReferencesIn,
  optionCaseKey,
  optionIdFromCaseKey,
} from '../dynamic-values.ts';
import { isProtocolObjectId } from '../protocol-object-id.ts';
import { ProtocolStructureSchema } from '../protocol-structure.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { completeProtocol } from './complete-localized-protocol.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

type Stage = Record<string, unknown>;

const conditionName = (conditionId: string) =>
  dynamicValueNameFor({ kind: 'condition', conditionId });

const CATEGORY = dynamicValueNameFor({
  kind: 'attribute',
  role: 'node',
  variableId: testVariableId('category'),
});

// The id `withTestIds` gives the first option of the fixture's category.
const FRIEND_ID = testId(
  JSON.stringify([
    'codebook',
    'node',
    'person',
    'variables',
    'category',
    'options',
    0,
  ]),
);

const dynamicAttributeName = (id: string) =>
  dynamicValueNameFor({ kind: 'dynamicAttribute', id });

// A dynamic attribute with a wording for one option of the attribute
// `value`, and "Who?" for any other answer.
const wordingForOption = (
  value: string,
  optionId: string,
  wording: string,
) => ({
  logic: 'answers',
  value,
  missing: { en: 'Who?' },
  answers: [{ answer: optionCaseKey(optionId), wording: { en: wording } }],
  other: { en: 'Who?' },
});

const FRIEND_WORDING_ID = testId('friend wording');
const STRENGTH_WORDING_ID = testId('strength wording');

// The option ids for which the dynamic attributes of a stage that read
// `value` have a wording.
const answerKeysOf = (stage: Stage | undefined, value: string) =>
  Object.values((stage?.dynamicAttributes ?? {}) as Record<string, Stage>)
    .filter((definition) => definition.value === value)
    .flatMap((definition) =>
      (definition.answers as { answer: string }[]).map(({ answer }) => answer),
    );

const egoRule = (id: string) => ({
  id: testId(id),
  type: 'ego',
  options: { attribute: testVariableId('egoName'), operator: 'EXISTS' },
});

/**
 * The complete protocol, given its ids, with an Information stage whose
 * text chooses between versions by each of `conditionIds`, and an alter form
 * question whose dynamic attribute chooses between versions by the first option of
 * an attribute.
 */
const protocolWith = (conditionIds: readonly string[]) => {
  const protocol = withFinishStage(completeProtocol());
  const stages = protocol.stages as Stage[];
  const information = stages.find((stage) => stage.type === 'Information');
  const alterForm = stages.find((stage) => stage.type === 'AlterForm');
  if (information === undefined || alterForm === undefined) {
    throw new Error('No Information stage or alter form');
  }
  information.conditions = Object.fromEntries(
    conditionIds.map((id, index) => [
      id,
      { rules: [egoRule(`rule ${index}`)] },
    ]),
  );
  information.content = {
    en: conditionIds
      .map((id) => `{${conditionName(id)}, select, true {Yes.} other {No.}}`)
      .join(' '),
  };
  alterForm.dynamicAttributes = {
    [FRIEND_WORDING_ID]: wordingForOption(CATEGORY, FRIEND_ID, 'Your friend?'),
  };
  (alterForm.form as { fields: Stage[] }).fields[0]!.prompt = {
    en: `{${dynamicAttributeName(FRIEND_WORDING_ID)}}`,
  };
  return { protocol, information, alterForm };
};

/** The complete protocol with `stages` before its Finish stage. */
const withStages = (stages: readonly Stage[]) => {
  const protocol = withFinishStage(completeProtocol());
  return { ...protocol, stages: [...stages, ...(protocol.stages as Stage[])] };
};

const contentOf = (stage: unknown) =>
  String(((stage as Stage).content as Record<string, string>).en);

const issuesOf = (protocol: unknown) => {
  const result = ProtocolSchemaV9.safeParse(protocol);
  return result.success ? [] : result.error.issues;
};

describe('freshenProtocolFragmentIds and the text that names conditions and options', () => {
  it('gives a condition whose key is taken a new one, and the text that names it its new name', () => {
    const taken = testId('taken');
    const kept = testId('kept');
    const { information } = protocolWith([taken, kept]);

    const { fragment, idMap } = freshenProtocolFragmentIds(information, [
      taken,
    ]);
    const conditionIds = Object.keys(fragment.conditions as Stage);
    expect(conditionIds).toHaveLength(2);
    expect(conditionIds.every(isProtocolObjectId)).toBe(true);
    expect(conditionIds).not.toContain(taken);
    expect(conditionIds).toContain(kept);
    expect(idMap.get(taken)).toBe(conditionIds[0]);

    // The text names the conditions the copy declares, in the same order.
    expect(
      dynamicValueReferencesIn(contentOf(fragment)).map(({ name }) => name),
    ).toEqual(conditionIds.map(conditionName));
  });

  it('gives a condition whose key is not a UUID a UUID', () => {
    const { information } = protocolWith([testId('kept')]);
    information.conditions = {
      ...(information.conditions as Stage),
      readable: { rules: [egoRule('readable rule')] },
    };
    const { fragment, idMap } = freshenProtocolFragmentIds(information, []);
    const conditionIds = Object.keys(fragment.conditions as Stage);
    expect(conditionIds).not.toContain('readable');
    expect(conditionIds.every(isProtocolObjectId)).toBe(true);
    expect(conditionIds).toContain(idMap.get('readable'));
  });

  it('keeps the text of each copied stage naming the conditions that its own stage declares, when two stages share a key', () => {
    // Condition keys are unique only within a stage, so two stages may share
    // one; copying both gives one of them a new key.
    const shared = testId('shared');
    const first = protocolWith([shared]).information;
    const second = structuredClone(first);
    second.id = testId('second information');
    second.content = {
      en: `{${conditionName(shared)}, select, true {Second.} other {No.}}`,
    };

    const destination = collectProtocolObjectIds(withStages([])).map(
      ({ id }) => id,
    );
    const { fragment } = freshenProtocolFragmentIds(
      [first, second],
      destination,
    );
    const [firstCopy, secondCopy] = fragment;
    const firstKeys = Object.keys(firstCopy!.conditions as Stage);
    const secondKeys = Object.keys(secondCopy!.conditions as Stage);
    expect(firstKeys).toEqual([shared]);
    expect(secondKeys).toHaveLength(1);
    expect(secondKeys).not.toEqual(firstKeys);
    expect(
      dynamicValueReferencesIn(contentOf(firstCopy)).map(({ name }) => name),
    ).toEqual(firstKeys.map(conditionName));
    expect(
      dynamicValueReferencesIn(contentOf(secondCopy)).map(({ name }) => name),
    ).toEqual(secondKeys.map(conditionName));
    expect(issuesOf(withStages([firstCopy!, secondCopy!]))).toEqual([]);
  });

  it('gives the options of a copied codebook new ids, and the dynamic attributes that choose by them their new keys', () => {
    const { protocol } = protocolWith([testId('condition')]);
    expect(issuesOf(protocol)).toEqual([]);
    const destination = collectProtocolObjectIds(protocol).map(({ id }) => id);

    const { fragment } = freshenProtocolFragmentIds(
      protocol,
      [...destination, testId('condition')],
      ProtocolStructureSchema,
    );
    const optionIds = collectProtocolObjectIds(fragment).flatMap(
      ({ id, kind }) => (kind === 'option' ? [id] : []),
    );
    expect(optionIds).not.toContain(FRIEND_ID);
    // A copy whose text named the old ids would choose by options and
    // conditions it does not have.
    expect(issuesOf(fragment)).toEqual([]);
    const alterForm = (fragment.stages as Stage[]).find(
      (stage) => stage.type === 'AlterForm',
    );
    if (alterForm === undefined) throw new Error('No alter form');
    expect(answerKeysOf(alterForm, CATEGORY).map(optionIdFromCaseKey)).toEqual([
      expect.toSatisfy((id: string) => optionIds.includes(id)),
    ]);
  });
});

describe('freshenProtocolFragmentIds and options that share an id', () => {
  const STRENGTH = dynamicValueNameFor({
    kind: 'attribute',
    role: 'node',
    variableId: testVariableId('strength'),
  });

  // The node type's variables, whichever key the type has.
  const personVariables = (codebook: { node: unknown }): Stage => {
    const variables = Object.values(
      codebook.node as Record<string, { variables?: Stage }>,
    )
      .map((type) => type.variables)
      .find((each) => each?.[testVariableId('strength')] !== undefined);
    if (variables === undefined) throw new Error('No Strength attribute');
    return variables;
  };

  it.each([
    ['taken by the destination', true],
    ['free', false],
  ])(
    'gives each variable’s dynamic attribute the new id of its own option, when the shared id is %s',
    (_, taken) => {
      const { protocol, alterForm } = protocolWith([testId('condition')]);
      const strengthOptions = (
        personVariables(protocol.codebook)[testVariableId('strength')] as Stage
      ).options as Stage[];
      // Strength's first option has the id of Category's first option.
      strengthOptions[0]!.id = FRIEND_ID;
      const prompt = (alterForm.form as { fields: Stage[] }).fields[0]!
        .prompt as Record<string, string>;
      prompt.en = `${prompt.en} {${dynamicAttributeName(STRENGTH_WORDING_ID)}}`;
      alterForm.dynamicAttributes = {
        ...(alterForm.dynamicAttributes as Stage),
        [STRENGTH_WORDING_ID]: wordingForOption(STRENGTH, FRIEND_ID, 'Weak?'),
      };

      const { fragment } = freshenProtocolFragmentIds(
        protocol,
        [...(taken ? [FRIEND_ID] : []), testId('condition')],
        ProtocolStructureSchema,
      );
      const copied = personVariables(fragment.codebook);
      const firstOptionOf = (key: string) =>
        String(
          ((copied[testVariableId(key)] as Stage).options as Stage[])[0]!.id,
        );
      const category = firstOptionOf('category');
      const strength = firstOptionOf('strength');
      expect(category === FRIEND_ID).toBe(!taken);
      expect(strength).not.toBe(FRIEND_ID);
      expect(strength).not.toBe(category);

      const copiedForm = (fragment.stages as Stage[]).find(
        (stage) => stage.type === 'AlterForm',
      );
      expect(answerKeysOf(copiedForm, CATEGORY)).toEqual([
        optionCaseKey(category),
      ]);
      expect(answerKeysOf(copiedForm, STRENGTH)).toEqual([
        optionCaseKey(strength),
      ]);
    },
  );
});

describe('the ids the migration gives options', () => {
  const migratedOptionIds = () =>
    collectProtocolObjectIds(
      migrateProtocol(asSchema8Protocol(completeProtocol()), 9),
    ).flatMap(({ id, kind }) => (kind === 'option' ? [id] : []));

  it('gives every option a UUID no other object has', () => {
    const migrated = migrateProtocol(asSchema8Protocol(completeProtocol()), 9);
    const ids = collectProtocolObjectIds(migrated).map(({ id }) => id);
    const optionIds = migratedOptionIds();
    expect(optionIds.length).toBeGreaterThan(4);
    expect(optionIds.every(isProtocolObjectId)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives the options of one protocol the same ids each time it is migrated', () => {
    expect(migratedOptionIds()).toEqual(migratedOptionIds());
  });
});
