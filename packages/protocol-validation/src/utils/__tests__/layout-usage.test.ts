import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../__tests__/finishStage.ts';
import {
  testId,
  withTestCodebookIds,
  withTestIds,
} from '../../__tests__/testIds.ts';
import { completeProtocol } from '../../schemas/9/__tests__/complete-localized-protocol.ts';
import { ProtocolSchemaV9 } from '../../schemas/9/schema.ts';
import { getStageNodeTypes } from '../../schemas/9/stage-capabilities.ts';
import type { Stage } from '../../schemas/9/stages/index.ts';
import { collectLayoutReferences } from '../collectEntityAttributeReferences.ts';
import {
  findUnreachableLayoutReads,
  getLayoutsOfNodeType,
  getLayoutUsage,
  getNodeTypesWithLayout,
  getStageLayoutUses,
  isFirstStageUsingLayout,
} from '../layoutUsage.ts';
import { createBaseProtocol, localized } from '../test-utils.ts';

const parsed = (protocol: unknown) => ProtocolSchemaV9.parse(protocol);

// The base protocol, whose Sociogram places people in `layoutPosition`, with
// a Network Composer that places colleagues in a layout of its own and a
// Narrative that shows colleagues in another.
const protocolWithNarrative = () => {
  const base = createBaseProtocol();
  return parsed(
    withFinishStage({
      ...base,
      codebook: {
        ...base.codebook,
        layouts: {
          ...base.codebook.layouts,
          colleagueMap: { name: 'colleague_map' },
          composerMap: { name: 'composer_map' },
          unused: { name: 'unused' },
        },
      },
      stages: [
        ...base.stages,
        {
          id: 'composer',
          type: 'NetworkComposer',
          label: localized('Composer'),
          subject: { entity: 'node', types: ['colleague'] },
          quickAdd: 'colleagueName',
          layout: 'composerMap',
          background: { concentricCircles: 3 },
        },
        {
          id: 'narrative',
          type: 'Narrative',
          label: localized('Narrative'),
          subject: { entity: 'node', types: ['colleague'] },
          background: { concentricCircles: 3 },
          presets: [
            {
              id: 'positions',
              label: localized('Positions'),
              layout: 'layoutPosition',
            },
            {
              id: 'colleagues',
              label: localized('Colleagues'),
              layout: 'colleagueMap',
            },
          ],
        },
      ],
    }),
  );
};

const layoutKeyNamed = (
  protocol: { codebook: { layouts?: Record<string, { name: string }> } },
  name: string,
) => {
  const entry = Object.entries(protocol.codebook.layouts ?? {}).find(
    ([, layout]) => layout.name === name,
  );
  if (!entry) throw new Error(`No layout named ${name}`);
  return entry[0];
};

const nodeTypeKeyNamed = (
  protocol: { codebook: { node?: Record<string, { name: string }> } },
  name: string,
) => {
  const entry = Object.entries(protocol.codebook.node ?? {}).find(
    ([, type]) => type.name === name,
  );
  if (!entry) throw new Error(`No node type named ${name}`);
  return entry[0];
};

describe('layout usage', () => {
  it('getNodeTypesWithLayout counts setting stages only', () => {
    const protocol = protocolWithNarrative();
    const person = nodeTypeKeyNamed(protocol, 'Person');

    // The Sociogram sets the layout for people; the Narrative reading it for
    // colleagues gives colleagues no position there.
    expect(
      getNodeTypesWithLayout(
        protocol,
        layoutKeyNamed(protocol, 'Layout_Position'),
      ),
    ).toEqual([person]);
    expect(
      getNodeTypesWithLayout(
        protocol,
        layoutKeyNamed(protocol, 'colleague_map'),
      ),
    ).toEqual([]);
  });

  it('a Network Composer sets its layout for its node types', () => {
    const protocol = protocolWithNarrative();
    const composerMap = layoutKeyNamed(protocol, 'composer_map');
    expect(getNodeTypesWithLayout(protocol, composerMap)).toEqual([
      nodeTypeKeyNamed(protocol, 'Colleague'),
    ]);
    expect(
      getLayoutUsage(protocol)[composerMap]?.setBy.map(
        ({ stageId, access }) =>
          `${protocol.stages.find(({ id }) => id === stageId)?.type ?? '?'} ${access}`,
      ),
    ).toEqual(['NetworkComposer sets']);
  });

  it('getLayoutUsage gives a layout set by several stages the node types of all of them, each once', () => {
    const protocol = protocolWithNarrative();
    const person = nodeTypeKeyNamed(protocol, 'Person');
    const colleague = nodeTypeKeyNamed(protocol, 'Colleague');
    const shared = layoutKeyNamed(protocol, 'Layout_Position');
    const stages = protocol.stages.flatMap((stage): Stage[] => {
      if (stage.type === 'NetworkComposer') {
        return [{ ...stage, layout: shared }];
      }
      if (stage.type === 'Sociogram') {
        return [
          stage,
          {
            ...stage,
            subject: { entity: 'node', types: [colleague] },
            layout: shared,
          },
        ];
      }
      return [stage];
    });

    const usage = getLayoutUsage({ ...protocol, stages })[shared];
    expect(usage?.nodeTypes).toEqual([person, colleague]);
    expect(
      usage?.setBy.map(
        ({ stageId, nodeTypes }) =>
          `${stages.find(({ id }) => id === stageId)?.type ?? '?'} ${nodeTypes.join(',')}`,
      ),
    ).toEqual([
      `Sociogram ${person}`,
      `Sociogram ${colleague}`,
      `NetworkComposer ${colleague}`,
    ]);
  });

  it('getLayoutUsage lists every layout of the codebook with its node types', () => {
    const protocol = protocolWithNarrative();
    expect(
      Object.fromEntries(
        Object.entries(getLayoutUsage(protocol)).map(([id, entry]) => [
          id,
          entry.nodeTypes,
        ]),
      ),
    ).toEqual({
      [layoutKeyNamed(protocol, 'Layout_Position')]: [
        nodeTypeKeyNamed(protocol, 'Person'),
      ],
      [layoutKeyNamed(protocol, 'colleague_map')]: [],
      [layoutKeyNamed(protocol, 'composer_map')]: [
        nodeTypeKeyNamed(protocol, 'Colleague'),
      ],
      [layoutKeyNamed(protocol, 'unused')]: [],
    });
  });

  // Only a hand-written file can name such a layout, and validation refuses
  // it; the helpers still answer for it instead of throwing.
  it('a stage naming a member every object inherits gets its own entry', () => {
    const protocol = protocolWithNarrative();
    const stages = protocol.stages.map((stage) =>
      stage.type === 'NetworkComposer'
        ? { ...stage, layout: 'toString' }
        : stage,
    );
    const usage = getLayoutUsage({ codebook: protocol.codebook, stages });
    expect(Object.hasOwn(usage, 'toString')).toBe(true);
    expect(usage.toString).toEqual(
      expect.objectContaining({ readBy: [], nodeTypes: [expect.any(String)] }),
    );
    expect(
      getNodeTypesWithLayout(
        { codebook: protocol.codebook, stages },
        'constructor',
      ),
    ).toEqual([]);
  });

  it('a layout no stage references is unused', () => {
    const protocol = protocolWithNarrative();
    expect(
      getLayoutUsage(protocol)[layoutKeyNamed(protocol, 'unused')],
    ).toEqual({ setBy: [], readBy: [], nodeTypes: [] });
    expect(
      getLayoutUsage(protocol)[layoutKeyNamed(protocol, 'colleague_map')]
        ?.readBy,
    ).toHaveLength(1);
  });

  it('layoutReference hits match getStageLayoutUses on the complete fixture', () => {
    const protocol = parsed(
      withTestIds(withTestCodebookIds(completeProtocol())),
    );
    const expectedAccess: Record<string, string> = {
      Sociogram: 'sets',
      NetworkComposer: 'sets',
      Narrative: 'reads',
    };
    const fromHits = collectLayoutReferences(protocol).map(
      ({ path, layoutId }) => {
        const stage = protocol.stages[Number(path[1])];
        return `${stage?.id ?? '?'} ${layoutId} ${expectedAccess[stage?.type ?? ''] ?? '?'}`;
      },
    );
    const fromUses = protocol.stages.flatMap((stage) =>
      getStageLayoutUses(stage).map(
        ({ stageId, layoutId, access, nodeTypes }) => {
          expect(nodeTypes).toEqual(getStageNodeTypes(stage));
          return `${stageId} ${layoutId} ${access}`;
        },
      ),
    );
    expect(fromHits.length).toBeGreaterThanOrEqual(3);
    expect(fromHits.toSorted()).toEqual(fromUses.toSorted());
  });

  it('getLayoutsOfNodeType lists the layouts a stage sets for the type', () => {
    const protocol = protocolWithNarrative();
    const person = nodeTypeKeyNamed(protocol, 'Person');
    const colleague = nodeTypeKeyNamed(protocol, 'Colleague');

    expect(getLayoutsOfNodeType(protocol, person)).toEqual([
      layoutKeyNamed(protocol, 'Layout_Position'),
    ]);
    // The Narrative reads Layout_Position and colleague_map for colleagues;
    // reading gives them neither.
    expect(getLayoutsOfNodeType(protocol, colleague)).toEqual([
      layoutKeyNamed(protocol, 'composer_map'),
    ]);
    expect(getLayoutsOfNodeType(protocol, 'nobody')).toEqual([]);
  });

  it('findUnreachableLayoutReads reports a reading use whose types no stage sets the layout for', () => {
    const protocol = protocolWithNarrative();
    const colleague = nodeTypeKeyNamed(protocol, 'Colleague');
    const narrative = protocol.stages.find(({ type }) => type === 'Narrative');
    if (narrative?.type !== 'Narrative') throw new Error('No Narrative');

    expect(findUnreachableLayoutReads(protocol)).toEqual([
      {
        stageId: narrative.id,
        presetId: narrative.presets[0]?.id,
        layoutId: layoutKeyNamed(protocol, 'Layout_Position'),
        nodeTypes: [colleague],
      },
      {
        stageId: narrative.id,
        presetId: narrative.presets[1]?.id,
        layoutId: layoutKeyNamed(protocol, 'colleague_map'),
        nodeTypes: [colleague],
      },
    ]);
  });

  it('findUnreachableLayoutReads is silent once another stage sets the layout for the type', () => {
    const protocol = protocolWithNarrative();
    const colleague = nodeTypeKeyNamed(protocol, 'Colleague');
    const colleagueMap = layoutKeyNamed(protocol, 'colleague_map');
    const shared = layoutKeyNamed(protocol, 'Layout_Position');
    // A later Sociogram that places colleagues in colleague_map, and a
    // Composer that places them in Layout_Position.
    const stages = protocol.stages.flatMap((stage): Stage[] => {
      if (stage.type === 'NetworkComposer') {
        return [{ ...stage, layout: shared }];
      }
      if (stage.type === 'Narrative') {
        const sociogram = protocol.stages.find(
          ({ type }) => type === 'Sociogram',
        );
        if (sociogram?.type !== 'Sociogram') throw new Error('No Sociogram');
        return [
          stage,
          {
            ...sociogram,
            id: testId('later-sociogram'),
            subject: { entity: 'node', types: [colleague] },
            layout: colleagueMap,
          },
        ];
      }
      return [stage];
    });

    expect(findUnreachableLayoutReads({ ...protocol, stages })).toEqual([]);
  });

  it('findUnreachableLayoutReads names only the types that no stage places in the layout', () => {
    const protocol = protocolWithNarrative();
    const person = nodeTypeKeyNamed(protocol, 'Person');
    const colleague = nodeTypeKeyNamed(protocol, 'Colleague');
    const shared = layoutKeyNamed(protocol, 'Layout_Position');
    // The helper takes any stages: a Narrative over people and colleagues
    // that shows the layout in which the Sociogram places people only.
    const stages = protocol.stages.map((stage): Stage => {
      if (stage.type !== 'Narrative') return stage;
      return {
        ...stage,
        subject: { entity: 'node', types: [person, colleague] },
        presets: stage.presets.map((preset) => ({ ...preset, layout: shared })),
      };
    });
    const narrative = stages.find(({ type }) => type === 'Narrative');
    if (narrative?.type !== 'Narrative') throw new Error('No Narrative');

    expect(findUnreachableLayoutReads({ ...protocol, stages })).toEqual(
      narrative.presets.map((preset) => ({
        stageId: narrative.id,
        presetId: preset.id,
        layoutId: shared,
        nodeTypes: [colleague],
      })),
    );
  });

  describe('a Sociogram by its tasks', () => {
    const sociogramOf = (
      protocol: ReturnType<typeof protocolWithNarrative>,
    ) => {
      const stage = protocol.stages.find(({ type }) => type === 'Sociogram');
      if (stage?.type !== 'Sociogram') throw new Error('No Sociogram');
      return stage;
    };
    const connectOnly = (
      stage: ReturnType<typeof sociogramOf>,
    ): ReturnType<typeof sociogramOf> => ({
      ...stage,
      prompts: [
        {
          id: testId('connect'),
          task: 'connect',
          text: localized('Link people who know each other'),
          edges: { create: 'knows' },
        },
      ],
    });

    it('a Sociogram with only connect tasks reads its layout', () => {
      const stage = connectOnly(sociogramOf(protocolWithNarrative()));
      expect(getStageLayoutUses(stage).map(({ access }) => access)).toEqual([
        'reads',
      ]);
    });

    it('automatic layout makes it set', () => {
      const stage = connectOnly(sociogramOf(protocolWithNarrative()));
      expect(
        getStageLayoutUses({
          ...stage,
          behaviours: { automaticLayout: true },
        }).map(({ access }) => access),
      ).toEqual(['sets']);
    });

    it('isFirstStageUsingLayout is false once an earlier stage names the layout', () => {
      const protocol = protocolWithNarrative();
      const sociogram = sociogramOf(protocol);
      const later = { ...connectOnly(sociogram), id: testId('later') };
      const stages = [...protocol.stages, later];
      const withLater = { ...protocol, stages };

      expect(
        isFirstStageUsingLayout(withLater, sociogram.id, sociogram.layout),
      ).toBe(true);
      expect(
        isFirstStageUsingLayout(withLater, later.id, sociogram.layout),
      ).toBe(false);
      // A stage that does not name the layout is never the first to use it,
      // even when no stage before it names the layout either.
      expect(
        isFirstStageUsingLayout(
          withLater,
          later.id,
          layoutKeyNamed(protocol, 'unused'),
        ),
      ).toBe(false);
    });
  });
});
