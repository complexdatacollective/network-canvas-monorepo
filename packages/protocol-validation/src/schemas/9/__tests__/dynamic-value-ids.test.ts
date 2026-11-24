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

const egoRule = (id: string) => ({
  id: testId(id),
  type: 'ego',
  options: { attribute: testVariableId('egoName'), operator: 'EXISTS' },
});

/**
 * The complete protocol, given its ids, with an Information stage whose
 * text chooses its wording by each of `conditionIds`, and an alter form
 * question that chooses its wording by the first option of an attribute.
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
  (alterForm.form as { fields: Stage[] }).fields[0]!.prompt = {
    en: `{${CATEGORY}, select, missing {Who?} ${optionCaseKey(FRIEND_ID)} {Your friend?} other {Who?}}`,
  };
  return { protocol, information, alterForm };
};

const contentOf = (stage: unknown) =>
  String(((stage as Stage).content as Record<string, string>).en);

const issuesOf = (protocol: unknown) => {
  const result = ProtocolSchemaV9.safeParse(protocol);
  return result.success ? [] : result.error.issues;
};

describe('freshenProtocolFragmentIds and the text that names conditions and options', () => {
  it('gives a condition whose key is taken or not a UUID a new one, and the text that names it its new name', () => {
    const taken = testId('taken');
    const readable = 'readable';
    const kept = testId('kept');
    const { information } = protocolWith([taken, readable, kept]);

    const { fragment, idMap } = freshenProtocolFragmentIds(information, [
      taken,
    ]);
    const conditionIds = Object.keys(fragment.conditions as Stage);
    expect(conditionIds).toHaveLength(3);
    expect(conditionIds.every(isProtocolObjectId)).toBe(true);
    expect(conditionIds).not.toContain(taken);
    expect(conditionIds).not.toContain(readable);
    expect(conditionIds).toContain(kept);
    expect(idMap.get(taken)).toBe(conditionIds[0]);
    expect(idMap.get(readable)).toBe(conditionIds[1]);

    // The text names the conditions the copy declares, in the same order.
    expect(
      dynamicValueReferencesIn(contentOf(fragment)).map(({ name }) => name),
    ).toEqual(conditionIds.map(conditionName));
  });

  it('gives the options of a copied codebook new ids, and the text that chooses by them their new keys', () => {
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
    const prompt = (alterForm.form as { fields: Stage[] }).fields[0]!
      .prompt as Record<string, string>;
    const [category] = dynamicValueReferencesIn(String(prompt.en));
    expect(category?.caseKeys.map(optionIdFromCaseKey)).toEqual([
      expect.toSatisfy((id: string) => optionIds.includes(id)),
    ]);
  });
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
