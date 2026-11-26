import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

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

const withSubjectTypes = (stageIndex: number, types: unknown) => {
  const protocol = loadFixture();
  const stage = stagesOf(protocol)[stageIndex];
  if (!stage) throw new Error(`No stage at ${stageIndex}`);
  stage.subject = { entity: 'node', types };
  return protocol;
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
    for (const { index, type } of nodeSubjectStageIndexes(fixture)) {
      expect(nodeTypeCapabilityOf(type)).toBe('single');
      expect(
        issuesFor(withSubjectTypes(index, types.slice(0, 2))),
        type,
      ).toContainEqual(
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
});
