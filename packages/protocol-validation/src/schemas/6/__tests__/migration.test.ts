import { describe, expect, it } from 'vitest';

import type { ProtocolDocument } from '~/migration';

import migrationV5toV6 from '../migration';

function getStages(result: ProtocolDocument<6>): Array<{ type: string }> {
  return (result as Record<string, unknown>).stages as Array<{ type: string }>;
}

describe('Migration V5 to V6', () => {
  it('renames NameGeneratorAutoComplete to NameGeneratorRoster', () => {
    const v5Protocol = {
      schemaVersion: 5 as const,
      codebook: { node: {}, edge: {} },
      stages: [{ id: 's1', type: 'NameGeneratorAutoComplete', prompts: [] }],
    } as ProtocolDocument<5>;

    const result = migrationV5toV6.migrate(v5Protocol, {});
    const stages = getStages(result);
    expect(stages).toHaveLength(1);
    expect(stages.at(0)?.type).toBe('NameGeneratorRoster');
  });

  it('renames NameGeneratorList to NameGeneratorRoster', () => {
    const v5Protocol = {
      schemaVersion: 5 as const,
      codebook: { node: {}, edge: {} },
      stages: [{ id: 's1', type: 'NameGeneratorList', prompts: [] }],
    } as ProtocolDocument<5>;

    const result = migrationV5toV6.migrate(v5Protocol, {});
    const stages = getStages(result);
    expect(stages).toHaveLength(1);
    expect(stages.at(0)?.type).toBe('NameGeneratorRoster');
  });

  it('does not modify other stage types', () => {
    const v5Protocol = {
      schemaVersion: 5 as const,
      codebook: { node: {}, edge: {} },
      stages: [
        { id: 's1', type: 'NameGenerator', prompts: [] },
        { id: 's2', type: 'Sociogram', prompts: [] },
      ],
    } as ProtocolDocument<5>;

    const result = migrationV5toV6.migrate(v5Protocol, {});
    const stages = getStages(result);
    expect(stages).toHaveLength(2);
    expect(stages.at(0)?.type).toBe('NameGenerator');
    expect(stages.at(1)?.type).toBe('Sociogram');
  });

  it('handles mixed stage types', () => {
    const v5Protocol = {
      schemaVersion: 5 as const,
      codebook: { node: {}, edge: {} },
      stages: [
        { id: 's1', type: 'NameGeneratorAutoComplete', prompts: [] },
        { id: 's2', type: 'NameGenerator', prompts: [] },
        { id: 's3', type: 'NameGeneratorList', prompts: [] },
      ],
    } as ProtocolDocument<5>;

    const result = migrationV5toV6.migrate(v5Protocol, {});
    const stages = getStages(result);
    expect(stages).toHaveLength(3);
    expect(stages.at(0)?.type).toBe('NameGeneratorRoster');
    expect(stages.at(1)?.type).toBe('NameGenerator');
    expect(stages.at(2)?.type).toBe('NameGeneratorRoster');
  });

  it('bumps schemaVersion to 6', () => {
    const v5Protocol = {
      schemaVersion: 5 as const,
      codebook: { node: {}, edge: {} },
      stages: [],
    } as ProtocolDocument<5>;

    const result = migrationV5toV6.migrate(v5Protocol, {});
    expect(result.schemaVersion).toBe(6);
  });

  it('has migration notes', () => {
    expect(migrationV5toV6.notes).toBeDefined();
    expect(migrationV5toV6.notes?.length).toBeGreaterThan(0);
  });

  it('has correct from and to versions', () => {
    expect(migrationV5toV6.from).toBe(5);
    expect(migrationV5toV6.to).toBe(6);
  });
});
