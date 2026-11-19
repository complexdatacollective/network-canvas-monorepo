import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { testId } from '../../../__tests__/testIds.ts';
import { migrateProtocol } from '../../../migration/migrate-protocol.ts';
import {
  collectProtocolObjectIds,
  findDuplicateProtocolObjectIds,
} from '../../../utils/collectProtocolObjectIds.ts';
import { freshenProtocolFragmentIds } from '../../../utils/freshenProtocolFragmentIds.ts';
import { hashProtocol } from '../../../utils/hashProtocol.ts';
import { DUPLICATE_OBJECT_ID } from '../../../utils/protocolObjectIds.ts';
import { createBaseProtocol } from '../../../utils/test-utils.ts';
import validateProtocol from '../../../validation/validate-protocol.ts';
import {
  assignProtocolObjectIds,
  createMigrationIdMinter,
} from '../migration-object-ids.ts';
import {
  isProtocolObjectId,
  registeredProtocolObjectKinds,
} from '../protocol-object-id.ts';
import { ProtocolSchemaV9 } from '../schema.ts';
import { nameGeneratorStage } from '../stages/name-generator.ts';
import { completeProtocol } from './complete-localized-protocol.ts';
import { asSchema8Protocol } from './schema-8-protocol.ts';

type Path = readonly PropertyKey[];

// The complete fixture with the kinds it has no object of added, so that it
// holds an object of every kind the schema marks.
const validProtocol = () => {
  const protocol = withFinishStage(completeProtocol());
  const stageOf = (type: string) =>
    protocol.stages.findIndex((stage) => stage.type === type);
  const nameGenerator = stageOf('NameGenerator');
  const roster = stageOf('NameGeneratorRoster');
  setAt(protocol, ['stages', nameGenerator, 'panels', 0, 'filter'], {
    rules: [
      {
        id: testId('kinds/rule'),
        type: 'node',
        options: { type: 'person', attribute: 'nickname', operator: 'EXISTS' },
      },
    ],
  });
  setAt(
    protocol,
    ['stages', nameGenerator, 'prompts', 0, 'additionalAttributes'],
    [
      {
        id: testId('kinds/additionalAttribute'),
        variable: 'flag',
        value: true,
      },
    ],
  );
  setAt(
    protocol,
    ['stages', roster, 'sortOptions', 'sortOrder'],
    [{ id: testId('kinds/sortRule'), property: 'name', direction: 'asc' }],
  );
  return protocol;
};

const issuesOf = (protocol: unknown) => {
  const result = ProtocolSchemaV9.safeParse(protocol);
  return result.success ? [] : result.error.issues;
};

type FlatIssue = { path: Path; message: string };

// A filter rule is a union member, so its issues arrive inside the union's
// issue, with paths relative to the rule.
const flatten = (
  issues: readonly {
    path: Path;
    message: string;
    errors?: readonly (readonly FlatIssue[])[];
  }[],
  prefix: Path = [],
): FlatIssue[] =>
  issues.flatMap(({ path, message, errors }) => [
    { path: [...prefix, ...path], message },
    ...(errors ?? []).flatMap((branch) =>
      flatten(branch, [...prefix, ...path]),
    ),
  ]);

const flatIssuesOf = (protocol: unknown) => flatten(issuesOf(protocol));

const duplicateIssuePaths = (
  issues: readonly z.core.$ZodIssue[],
  id?: string,
): Path[] =>
  issues.flatMap((issue) =>
    issue.code === 'custom' &&
    issue.params?.rule === DUPLICATE_OBJECT_ID &&
    (id === undefined || issue.params.id === id)
      ? [issue.path]
      : [],
  );

const duplicatePaths = (protocol: unknown, id: string): Path[] =>
  duplicateIssuePaths(issuesOf(protocol), id);

const getAt = (root: unknown, at: Path): unknown =>
  at.reduce<unknown>(
    (node, key) =>
      typeof node === 'object' && node !== null
        ? Reflect.get(node, key)
        : undefined,
    root,
  );

const setAt = (root: unknown, at: Path, value: unknown) => {
  const parent = getAt(root, at.slice(0, -1));
  const key = at.at(-1);
  if (typeof parent === 'object' && parent !== null && key !== undefined) {
    Reflect.set(parent, key, value);
  }
};

const removeAt = (root: unknown, at: Path) => {
  const parent = getAt(root, at.slice(0, -1));
  const key = at.at(-1);
  if (typeof parent === 'object' && parent !== null && key !== undefined) {
    Reflect.deleteProperty(parent, key);
  }
};

const firstIdOfKind = (protocol: unknown, kind: string) => {
  const found = collectProtocolObjectIds(protocol).find(
    (location) => location.kind === kind,
  );
  if (!found) throw new Error(`No ${kind} in the fixture`);
  return found;
};

describe('protocol object ids in schema 9', () => {
  it('holds an object of every marked kind in the complete fixture', () => {
    // The fixture stands for every kind the schema marks, so the tests below
    // exercise each.
    const kinds = new Set(
      collectProtocolObjectIds(validProtocol()).map(({ kind }) => kind),
    );
    expect([...kinds].toSorted()).toEqual(
      registeredProtocolObjectKinds().toSorted(),
    );
  });

  it('accepts the complete fixture, whose ids are UUIDs found nowhere else', () => {
    const protocol = validProtocol();
    expect(issuesOf(protocol)).toEqual([]);
    expect(findDuplicateProtocolObjectIds(protocol)).toEqual([]);
  });

  it.each(registeredProtocolObjectKinds())('requires a %s id', (kind) => {
    const protocol = validProtocol();
    const { path } = firstIdOfKind(protocol, kind);
    removeAt(protocol, path);
    expect(flatIssuesOf(protocol).map((issue) => issue.path)).toContainEqual(
      path,
    );
  });

  it.each(registeredProtocolObjectKinds())(
    'requires a %s id to be a UUID',
    (kind) => {
      const protocol = validProtocol();
      const { path } = firstIdOfKind(protocol, kind);
      setAt(protocol, path, 'readable-id');
      expect(flatIssuesOf(protocol)).toContainEqual({
        path,
        message: 'An id must be a UUID.',
      });
    },
  );

  it('refuses one id on objects of unrelated kinds on different stages, at both', () => {
    const protocol = validProtocol();
    const locations = collectProtocolObjectIds(protocol);
    const panel = locations.find(({ kind }) => kind === 'panel');
    const disease = locations.find(({ kind }) => kind === 'disease');
    if (!panel || !disease) throw new Error('No panel or disease');
    expect(panel.path[1]).not.toBe(disease.path[1]);
    setAt(protocol, disease.path, panel.id);

    expect(duplicatePaths(protocol, panel.id)).toEqual(
      expect.arrayContaining([panel.path, disease.path]),
    );
    expect(findDuplicateProtocolObjectIds(protocol)).toEqual([
      { id: panel.id, paths: [panel.path, disease.path] },
    ]);
  });

  it('refuses a stage id repeated by an object inside another stage', () => {
    const protocol = validProtocol();
    const [stage] = collectProtocolObjectIds(protocol);
    const prompt = collectProtocolObjectIds(protocol).find(
      ({ kind, path }) => kind === 'prompt' && path[1] !== stage?.path[1],
    );
    if (!stage || !prompt) throw new Error('No stage or prompt');
    setAt(protocol, prompt.path, stage.id);

    expect(duplicatePaths(protocol, stage.id)).toEqual(
      expect.arrayContaining([stage.path, prompt.path]),
    );
  });

  it('refuses a repeat within one stage when the stage is parsed alone', () => {
    const [stage] = createBaseProtocol().stages;
    const result = nameGeneratorStage.safeParse({
      ...stage,
      prompts: [
        ...(stage?.prompts ?? []),
        { id: stage?.form?.fields[0]?.id, text: { en: 'Who else?' } },
      ],
    });
    expect(result.success).toBe(false);
    expect(duplicateIssuePaths(result.error?.issues ?? [])).toEqual([
      ['form', 'fields', 0, 'id'],
      ['prompts', 1, 'id'],
    ]);
  });

  it('marks no id outside an object a researcher edits on its own', () => {
    // Codebook entries are keyed by their map key and options by their value,
    // and primitive arrays have nothing to hold an id.
    const paths = collectProtocolObjectIds(validProtocol()).map(
      ({ path }) => path,
    );
    expect(paths.every((path) => path[0] === 'stages')).toBe(true);
    expect(
      paths.some((path) =>
        path.some((key) => key === 'options' || key === 'codebook'),
      ),
    ).toBe(false);
  });

  it('attaches a validation issue to the object it is about', async () => {
    const protocol = validProtocol();
    const prompt = firstIdOfKind(protocol, 'prompt');
    setAt(protocol, [...prompt.path.slice(0, -1), 'text'], 'Not localized');

    const result = await validateProtocol(protocol);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: expect.arrayContaining([...prompt.path.slice(0, -1), 'text']),
        objectId: prompt.id,
      }),
    );
  });
});

describe('the protocol hash and object ids', () => {
  it('changes when an id changes', () => {
    const protocol = validProtocol();
    const prompt = firstIdOfKind(protocol, 'prompt');
    const before = hashProtocol(protocol);
    setAt(protocol, prompt.path, testId('another prompt'));
    expect(hashProtocol(protocol)).not.toBe(before);
  });

  it('is the same after validation, and for every migration of one document', async () => {
    const protocol = validProtocol();
    const before = hashProtocol(protocol);
    await validateProtocol(protocol);
    expect(hashProtocol(protocol)).toBe(before);

    const schema8 = asSchema8Protocol(completeProtocol());
    expect(hashProtocol(migrateProtocol(schema8, 9))).toBe(
      hashProtocol(migrateProtocol(schema8, 9)),
    );
  });
});

describe('freshenProtocolFragmentIds', () => {
  const stagesOf = (protocol: { stages: unknown[] }) => protocol.stages;

  it('gives every id the destination holds a new one, and keeps the rest', () => {
    const protocol = validProtocol();
    const [first, second] = stagesOf(protocol);
    const destination = collectProtocolObjectIds({
      ...protocol,
      stages: [first],
    }).map(({ id }) => id);

    const { fragment, idMap } = freshenProtocolFragmentIds(
      [first, second],
      destination,
    );
    const ids = collectProtocolObjectIds({ ...protocol, stages: fragment });
    const secondIds = collectProtocolObjectIds({
      ...protocol,
      stages: [second],
    }).map(({ id }) => id);

    expect(ids.filter(({ id }) => destination.includes(id))).toEqual([]);
    expect(ids.map(({ id }) => id).slice(-secondIds.length)).toEqual(secondIds);
    expect([...idMap.keys()].toSorted()).toEqual(destination.toSorted());
    for (const [from, to] of idMap) {
      expect(
        ids.find(({ path }) => {
          const index = destination.indexOf(from);
          return index >= 0 && getAt(fragment, path.slice(1)) === to;
        }),
      ).toBeDefined();
    }
  });

  it('replaces ids that are missing, not UUIDs, or repeated in the fragment', () => {
    const [stage] = createBaseProtocol().stages;
    const { fragment, idMap } = freshenProtocolFragmentIds(
      {
        ...stage,
        id: 'readable',
        prompts: [
          { id: testId('repeated'), text: { en: 'One' } },
          { id: testId('repeated'), text: { en: 'Two' } },
          { text: { en: 'Three' } },
          { id: 'p1', text: { en: 'Four' } },
          { id: 'p1', text: { en: 'Five' } },
        ],
      },
      [],
    );

    const promptIds = fragment.prompts.map((prompt) => prompt.id);
    expect(isProtocolObjectId(fragment.id)).toBe(true);
    expect(idMap.get('readable')).toBe(fragment.id);
    expect(promptIds[0]).toBe(testId('repeated'));
    expect(idMap.get('p1')).toBe(promptIds[3]);
    expect(new Set(promptIds).size).toBe(5);
    expect(promptIds.every(isProtocolObjectId)).toBe(true);
  });

  it('points stage references inside the fragment at the renamed stages', () => {
    const [nameGenerator, sociogram] = createBaseProtocol().stages;
    const skipping = {
      ...nameGenerator,
      skipLogic: {
        action: 'SKIP' as const,
        filter: { rules: [] },
        destination: { type: 'stage' as const, stageId: sociogram?.id },
      },
    };
    const { fragment, idMap } = freshenProtocolFragmentIds(
      [skipping, sociogram],
      [nameGenerator?.id ?? '', sociogram?.id ?? ''],
    );

    expect(getAt(fragment, [0, 'skipLogic', 'destination', 'stageId'])).toBe(
      idMap.get(sociogram?.id ?? ''),
    );
    expect(getAt(fragment, [1, 'id'])).toBe(idMap.get(sociogram?.id ?? ''));
  });

  it('never changes the fragment it is given', () => {
    const [stage] = createBaseProtocol().stages;
    const copy = structuredClone(stage);
    freshenProtocolFragmentIds(stage, [stage?.id ?? '']);
    expect(stage).toEqual(copy);
  });

  it('gives any fragment ids found neither in the destination nor twice', () => {
    const stages = stagesOf(validProtocol());
    fc.assert(
      fc.property(
        fc.subarray(stages, { minLength: 1 }),
        fc.boolean(),
        (fragmentStages, duplicated) => {
          const source = duplicated
            ? [...fragmentStages, ...fragmentStages]
            : fragmentStages;
          const destination = collectProtocolObjectIds({
            stages: fragmentStages,
          }).map(({ id }) => id);
          const { fragment } = freshenProtocolFragmentIds(source, destination);
          const ids = collectProtocolObjectIds({ stages: fragment }).map(
            ({ id }) => id,
          );
          return (
            ids.every(isProtocolObjectId) &&
            new Set(ids).size === ids.length &&
            ids.every((id) => !destination.includes(id))
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('the migration id pass', () => {
  type Damage = 'missing' | 'readable' | 'repeat';

  // The complete fixture with the ids at the chosen places damaged as given.
  const damaged = (choices: readonly [number, Damage][]) => {
    const protocol = validProtocol();
    const locations = collectProtocolObjectIds(protocol);
    for (const [index, damage] of choices) {
      const location = locations[index % locations.length];
      const other = locations[(index + 1) % locations.length];
      if (!location || !other) continue;
      if (damage === 'missing') removeAt(protocol, location.path);
      else if (damage === 'readable') setAt(protocol, location.path, 'x');
      else setAt(protocol, location.path, other.id);
    }
    return protocol;
  };

  const damage = fc.array(
    fc.tuple(
      fc.nat(),
      fc.constantFrom<Damage>('missing', 'readable', 'repeat'),
    ),
    { maxLength: 12 },
  );

  it('gives every object a UUID no other object has, and keeps undamaged ones', () => {
    fc.assert(
      fc.property(damage, (choices) => {
        const input = damaged(choices);
        const kept = new Set(
          collectProtocolObjectIds(input)
            .map(({ id }) => id)
            .filter((id, index, all) => all.indexOf(id) === index),
        );
        const document = structuredClone(input);
        assignProtocolObjectIds(document, createMigrationIdMinter(input));
        const ids = collectProtocolObjectIds(document).map(({ id }) => id);
        return (
          ids.every(isProtocolObjectId) &&
          new Set(ids).size === ids.length &&
          [...kept].every((id) => !isProtocolObjectId(id) || ids.includes(id))
        );
      }),
      { numRuns: 50 },
    );
  });

  it('gives the same ids every time, and changes nothing on a second pass', () => {
    fc.assert(
      fc.property(damage, (choices) => {
        const input = damaged(choices);
        const once = structuredClone(input);
        assignProtocolObjectIds(once, createMigrationIdMinter(input));
        const again = structuredClone(input);
        assignProtocolObjectIds(again, createMigrationIdMinter(input));
        const twice = structuredClone(once);
        assignProtocolObjectIds(twice, createMigrationIdMinter(once));
        expect(again).toEqual(once);
        expect(twice).toEqual(once);
      }),
      { numRuns: 30 },
    );
  });
});
