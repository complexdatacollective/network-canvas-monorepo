import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../__tests__/finishStage.ts';
import { withTestCodebookIds, withTestIds } from '../../__tests__/testIds.ts';
import { completeProtocol } from '../../schemas/9/__tests__/complete-localized-protocol.ts';
import { ProtocolSchemaV9 } from '../../schemas/9/schema.ts';
import { collectLayoutReferences } from '../collectEntityAttributeReferences.ts';
import {
  getLayoutUsage,
  getNodeTypesWithLayout,
  getStageLayoutUses,
} from '../layoutUsage.ts';
import { createBaseProtocol, localized } from '../test-utils.ts';

const parsed = (protocol: unknown) => ProtocolSchemaV9.parse(protocol);

// The base protocol, whose Sociogram places people in `layoutPosition`, with
// a Narrative that shows colleagues in a layout of its own.
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
          unused: { name: 'unused' },
        },
      },
      stages: [
        ...base.stages,
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
    const fromHits = collectLayoutReferences(protocol).map(
      ({ path, layoutId }) => {
        const stage = protocol.stages[Number(path[1])];
        return `${stage?.id ?? '?'} ${layoutId}`;
      },
    );
    const fromUses = protocol.stages.flatMap((stage) =>
      getStageLayoutUses(stage).map(
        ({ stageId, layoutId }) => `${stageId} ${layoutId}`,
      ),
    );
    expect(fromHits.length).toBeGreaterThanOrEqual(3);
    expect(fromHits.toSorted()).toEqual(fromUses.toSorted());
  });
});
