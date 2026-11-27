import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProtocolSchemaV9 } from '../schema.ts';
import {
  nodeTypeCapabilityOf,
  STAGE_NODE_TYPE_CAPABILITY,
} from '../stage-capabilities.ts';

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fixturePath = path.resolve(
  import.meta.dirname,
  '../../../../../protocols/e2e/all-interfaces/protocol.json',
);

const loadFixture = (): Fields => {
  const parsed: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));
  if (!isRecord(parsed)) throw new Error('The fixture is not an object');
  return parsed;
};

const stagesOf = (protocol: Fields): Fields[] => {
  const { stages } = protocol;
  if (!Array.isArray(stages)) throw new Error('The fixture has no stages');
  return stages.filter(isRecord);
};

const nodeTypeIds = (protocol: Fields): string[] => {
  const { codebook } = protocol;
  if (!isRecord(codebook) || !isRecord(codebook.node)) return [];
  return Object.keys(codebook.node);
};

const nodeSubjectStageIndexes = (protocol: Fields) =>
  stagesOf(protocol).flatMap((stage, index) =>
    isRecord(stage.subject) && stage.subject.entity === 'node'
      ? [{ index, type: String(stage.type) }]
      : [],
  );

const issuesFor = (protocol: Fields) => {
  const result = ProtocolSchemaV9.safeParse(protocol);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
};

const withSubject = (stageIndex: number, subject: unknown) => {
  const protocol = loadFixture();
  const stage = stagesOf(protocol)[stageIndex];
  if (!stage) throw new Error(`No stage at ${stageIndex}`);
  stage.subject = subject;
  return protocol;
};

const withSubjectTypes = (stageIndex: number, types: unknown) =>
  withSubject(stageIndex, { entity: 'node', types });

// The protocol schema built with one stage type's capability raised to
// 'several', as the stage modules read the table when they are first loaded.
const protocolSchemaRaising = async (stageType: string) => {
  vi.resetModules();
  vi.doMock('../stage-capabilities.ts', async (importOriginal) => {
    const actual =
      await importOriginal<typeof import('../stage-capabilities.ts')>();
    return {
      ...actual,
      STAGE_NODE_TYPE_CAPABILITY: {
        ...actual.STAGE_NODE_TYPE_CAPABILITY,
        [stageType]: 'several',
      },
    };
  });
  const { ProtocolSchemaV9: schema } = await import('../schema.ts');
  return (protocol: Fields) => {
    const result = schema.safeParse(protocol);
    if (result.success) return [];
    return result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  };
};

describe('node stage subjects', () => {
  it('the fixture covers every stage type that takes a node subject', () => {
    const fixture = loadFixture();
    expect(issuesFor(fixture)).toEqual([]);
    expect(
      new Set(nodeSubjectStageIndexes(fixture).map(({ type }) => type)),
    ).toEqual(new Set(Object.keys(STAGE_NODE_TYPE_CAPABILITY)));
  });

  it('rejects an empty types list', () => {
    for (const { index } of nodeSubjectStageIndexes(loadFixture())) {
      expect(issuesFor(withSubjectTypes(index, []))).toContainEqual(
        expect.objectContaining({ path: `stages.${index}.subject.types` }),
      );
    }
  });

  it('rejects a duplicate type', () => {
    const fixture = loadFixture();
    const [first] = nodeTypeIds(fixture);
    const { index } = nodeSubjectStageIndexes(fixture)[0] ?? { index: -1 };
    expect(
      issuesFor(withSubjectTypes(index, [first, first])).map(
        (issue) => issue.message,
      ),
    ).toContain(`Node type "${first}" is listed more than once.`);
  });

  it('rejects a second type on every stage type while its capability is single', () => {
    const fixture = loadFixture();
    const types = nodeTypeIds(fixture);
    expect(types.length).toBeGreaterThanOrEqual(2);
    const single = nodeSubjectStageIndexes(fixture).filter(
      ({ type }) => nodeTypeCapabilityOf(type) === 'single',
    );
    expect(single.length).toBeGreaterThan(0);
    for (const { index, type } of single) {
      expect(
        issuesFor(withSubjectTypes(index, types.slice(0, 2))),
        type,
      ).toContainEqual(
        expect.objectContaining({ path: `stages.${index}.subject.types` }),
      );
    }
  });

  it('accepts a second type on every stage type whose capability is several', () => {
    const fixture = loadFixture();
    const types = nodeTypeIds(fixture);
    const several = nodeSubjectStageIndexes(fixture).filter(
      ({ type }) => nodeTypeCapabilityOf(type) === 'several',
    );
    expect(several.map(({ type }) => type)).toContain('Sociogram');
    for (const { index, type } of several) {
      expect(
        issuesFor(withSubjectTypes(index, types.slice(0, 2))),
        type,
      ).not.toContainEqual(
        expect.objectContaining({ path: `stages.${index}.subject.types` }),
      );
    }
  });

  it('rejects an unknown node type in types', () => {
    for (const { index } of nodeSubjectStageIndexes(loadFixture())) {
      expect(
        issuesFor(withSubjectTypes(index, ['no-such-type'])),
      ).toContainEqual({
        path: `stages.${index}.subject`,
        message: 'Stage subject is not defined in the codebook',
      });
    }
  });

  it('rejects a schema 8 type key on a node subject', () => {
    const fixture = loadFixture();
    const [first, second] = nodeTypeIds(fixture);
    for (const { index } of nodeSubjectStageIndexes(fixture)) {
      for (const subject of [
        { entity: 'node', type: first },
        { entity: 'node', types: [first], type: second },
      ]) {
        expect(
          issuesFor(withSubject(index, subject)),
          JSON.stringify(subject),
        ).toContainEqual(
          expect.objectContaining({ path: `stages.${index}.subject` }),
        );
      }
    }
  });

  describe('a stage type raised to several types', () => {
    afterEach(() => {
      vi.doUnmock('../stage-capabilities.ts');
      vi.resetModules();
    });

    it('accepts several types on that stage type alone', async () => {
      const fixture = loadFixture();
      const types = nodeTypeIds(fixture).slice(0, 2);
      const stages = nodeSubjectStageIndexes(fixture);
      for (const raised of Object.keys(STAGE_NODE_TYPE_CAPABILITY)) {
        const issuesWhenRaised = await protocolSchemaRaising(raised);
        for (const { index, type } of stages) {
          const issues = issuesWhenRaised(withSubjectTypes(index, types));
          const capped = expect.objectContaining({
            path: `stages.${index}.subject.types`,
          });
          if (type === raised || nodeTypeCapabilityOf(type) === 'several') {
            expect(issues, `${type} raised`).not.toContainEqual(capped);
          } else {
            expect(issues, `${type} while ${raised} is raised`).toContainEqual(
              capped,
            );
          }
        }
      }
    });

    it('rejects an unknown second type', async () => {
      const fixture = loadFixture();
      const [known] = nodeTypeIds(fixture);
      const { index } = nodeSubjectStageIndexes(fixture).find(
        ({ type }) => type === 'Sociogram',
      ) ?? { index: -1 };
      const issuesWhenRaised = await protocolSchemaRaising('Sociogram');
      expect(
        issuesWhenRaised(withSubjectTypes(index, [known, 'no-such-type'])),
      ).toContainEqual({
        path: `stages.${index}.subject`,
        message: 'Stage subject is not defined in the codebook',
      });
    });
  });
});
