import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../schema.ts';

const filter = {
  rules: [
    {
      id: 'consent-rule',
      type: 'ego' as const,
      options: {
        attribute: 'egoAge',
        operator: 'EXISTS' as const,
      },
    },
  ],
};

const withDestination = (
  ownerIndex: number,
  destination: unknown,
  action: 'SHOW' | 'SKIP' = 'SKIP',
) => {
  const protocol = createBaseProtocol();

  return {
    ...protocol,
    stages: protocol.stages.map((stage, index) =>
      index === ownerIndex
        ? {
            ...stage,
            skipLogic: { action, filter, destination },
          }
        : stage,
    ),
  };
};

describe('schema 8 skip-logic destinations', () => {
  it('preserves legacy skip logic without a destination', () => {
    const protocol = createBaseProtocol();
    const protocolWithSkipLogic = {
      ...protocol,
      stages: [
        {
          ...protocol.stages[0]!,
          skipLogic: { action: 'SKIP', filter },
        },
        ...protocol.stages.slice(1),
      ],
    };

    expect(ProtocolSchemaV8.safeParse(protocolWithSkipLogic).success).toBe(
      true,
    );
  });

  it.each(['SHOW', 'SKIP'] as const)(
    'accepts a forward stage destination with the %s action',
    (action) => {
      const result = ProtocolSchemaV8.safeParse(
        withDestination(0, { type: 'stage', stageId: 'sociogram1' }, action),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stages[0]?.skipLogic?.destination).toEqual({
          type: 'stage',
          stageId: 'sociogram1',
        });
      }
    },
  );

  it('accepts an explicit finish destination', () => {
    const result = ProtocolSchemaV8.safeParse(
      withDestination(0, { type: 'finish' }, 'SHOW'),
    );

    expect(result.success).toBe(true);
  });

  it('rejects a destination that does not reference an existing stage', () => {
    const result = ProtocolSchemaV8.safeParse(
      withDestination(0, { type: 'stage', stageId: 'missing-stage' }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          message: 'Skip destination stage "missing-stage" does not exist.',
          path: ['stages', 0, 'skipLogic', 'destination', 'stageId'],
        }),
      );
    }
  });

  it('rejects a self destination', () => {
    const result = ProtocolSchemaV8.safeParse(
      withDestination(0, { type: 'stage', stageId: 'nameGenerator1' }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          message:
            'Skip destination stage "nameGenerator1" must come after the stage that references it.',
          path: ['stages', 0, 'skipLogic', 'destination', 'stageId'],
        }),
      );
    }
  });

  it('rejects a backward destination', () => {
    const result = ProtocolSchemaV8.safeParse(
      withDestination(1, { type: 'stage', stageId: 'nameGenerator1' }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['stages', 1, 'skipLogic', 'destination', 'stageId'],
        }),
      );
    }
  });

  it('rejects a stage destination without a stageId at the exact field path', () => {
    const result = ProtocolSchemaV8.safeParse(
      withDestination(0, { type: 'stage' }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['stages', 0, 'skipLogic', 'destination', 'stageId'],
        }),
      );
    }
  });

  it('rejects an unknown destination type at the discriminator path', () => {
    const result = ProtocolSchemaV8.safeParse(
      withDestination(0, { type: 'summary' }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['stages', 0, 'skipLogic', 'destination', 'type'],
        }),
      );
    }
  });

  it('rejects properties that do not belong to the finish destination', () => {
    const result = ProtocolSchemaV8.safeParse(
      withDestination(0, { type: 'finish', stageId: 'sociogram1' }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['stages', 0, 'skipLogic', 'destination'],
        }),
      );
    }
  });
});
