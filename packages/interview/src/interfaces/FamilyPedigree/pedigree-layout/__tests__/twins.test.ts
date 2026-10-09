import { describe, expect, it } from 'vitest';

import { alignPedigree } from '../alignPedigree';
import { computeConnectors } from '../connectors';
import { toPedigreeInput } from '../pedigreeAdapter';
import type { PedigreeLink, ScalingParams } from '../types';

const scaling: ScalingParams = {
  boxWidth: 0.6,
  boxHeight: 0.5,
  legHeight: 0.25,
  hScale: 1,
  vScale: 1,
};

/** mum + dad, with their children in the order recorded. */
function family(children: string[], twins: PedigreeLink[]) {
  const ids = ['mum', 'dad', ...children];
  const links: PedigreeLink[] = [
    { source: 'mum', target: 'dad', kind: 'partner' },
    ...children.flatMap((child) => [
      { source: 'mum', target: child, kind: 'biological' as const },
      { source: 'dad', target: child, kind: 'biological' as const },
    ]),
    ...twins,
  ];
  const { input } = toPedigreeInput(ids, links);
  const layout = alignPedigree(input);
  const connectors = computeConnectors(
    layout,
    scaling,
    input.parents,
    undefined,
    undefined,
    undefined,
    undefined,
    ids,
  );
  const layer = childLayer(layout);
  const row = layout.nid[layer]!.slice(0, layout.n[layer]).map(
    (index) => ids[index],
  );
  return { input, layout, connectors, row, layer };
}

/** The row of mum and dad's children (person 2 is the first of them). */
function childLayer(layout: ReturnType<typeof alignPedigree>) {
  return layout.nid.findIndex((row, level) =>
    row.slice(0, layout.n[level]).includes(2),
  );
}

const twin = (
  source: string,
  target: string,
  kind: PedigreeLink['kind'],
): PedigreeLink => ({ source, target, kind });

describe('twins', () => {
  it.each([
    ['identicalTwin', 1],
    ['fraternalTwin', 2],
    ['unknownZygosityTwin', 3],
  ] as const)(
    'a %s link is fed to the layout as twin code %i',
    (kind, code) => {
      const { input, layout, row, layer } = family(
        ['a', 'b'],
        [twin('b', 'a', kind)],
      );
      expect(input.relation).toContainEqual({ id1: 3, id2: 2, code });
      expect(layout.twins?.[layer]?.[row.indexOf('a')]).toBe(code);
    },
  );

  it('sit side by side even when a sibling was recorded between them', () => {
    const { row } = family(
      ['a', 'middle', 'b'],
      [twin('a', 'b', 'identicalTwin')],
    );
    expect(Math.abs(row.indexOf('a') - row.indexOf('b'))).toBe(1);
  });

  it('share one point on the sibling bar, with a bar between identical twins', () => {
    const { connectors, layout, row, layer } = family(
      ['older', 'a', 'b'],
      [twin('a', 'b', 'identicalTwin')],
    );
    const lines = connectors.parentChildLines.flatMap((line) =>
      line.uplines.map((upline, k) => ({
        child: line.uplineChildIds?.[k],
        upline,
      })),
    );
    const top = (child: string) =>
      lines.find((line) => line.child === child)!.upline.x2;
    expect(top('a')).toBeCloseTo(top('b'));
    expect(top('older')).not.toBeCloseTo(top('a'));
    const marks = connectors.twinIndicators;
    expect(marks).toHaveLength(1);
    expect(marks[0]!.code).toBe(1);
    expect(marks[0]!.twinIds?.toSorted()).toEqual(['a', 'b']);
    const bar = marks[0]!.segment!;
    const x = (child: string) => layout.pos[layer]![row.indexOf(child)]!;
    expect(Math.min(bar.x1, bar.x2)).toBeGreaterThan(
      Math.min(x('a'), x('b')) - 1e-9,
    );
    expect(Math.max(bar.x1, bar.x2)).toBeLessThan(
      Math.max(x('a'), x('b')) + 1e-9,
    );
  });

  it('marks twins of unknown zygosity with a question mark, fraternal twins with nothing', () => {
    const unknown = family(['a', 'b'], [twin('a', 'b', 'unknownZygosityTwin')]);
    expect(unknown.connectors.twinIndicators).toEqual([
      expect.objectContaining({ code: 3, label: expect.any(Object) }),
    ]);
    const fraternal = family(['a', 'b'], [twin('a', 'b', 'fraternalTwin')]);
    expect(fraternal.connectors.twinIndicators).toEqual([
      expect.objectContaining({ code: 2 }),
    ]);
    expect(fraternal.connectors.twinIndicators[0]!.segment).toBeUndefined();
    expect(fraternal.connectors.twinIndicators[0]!.label).toBeUndefined();
  });

  it('draws identical triplets with a bar between each neighbouring pair', () => {
    const { connectors, row } = family(
      ['a', 'other', 'b', 'c'],
      [
        twin('a', 'b', 'identicalTwin'),
        twin('b', 'c', 'identicalTwin'),
        twin('a', 'c', 'identicalTwin'),
      ],
    );
    const cols = ['a', 'b', 'c'].map((child) => row.indexOf(child));
    expect(Math.max(...cols) - Math.min(...cols)).toBe(2);
    expect(
      connectors.twinIndicators.filter((mark) => mark.code === 1),
    ).toHaveLength(2);
  });

  it('keeps a married twin’s partner off the side of the other twin', () => {
    const ids = ['mum', 'dad', 'older', 'a', 'b', 'aWife'];
    const links: PedigreeLink[] = [
      { source: 'mum', target: 'dad', kind: 'partner' },
      ...['older', 'a', 'b'].flatMap((child) => [
        { source: 'mum', target: child, kind: 'biological' as const },
        { source: 'dad', target: child, kind: 'biological' as const },
      ]),
      { source: 'a', target: 'aWife', kind: 'partner' },
      twin('a', 'b', 'fraternalTwin'),
    ];
    const { input } = toPedigreeInput(ids, links);
    const layout = alignPedigree(input);
    const layer = childLayer(layout);
    const row = layout.nid[layer]!.slice(0, layout.n[layer]).map(
      (index) => ids[index],
    );
    expect(Math.abs(row.indexOf('a') - row.indexOf('b'))).toBe(1);
    expect(Math.abs(row.indexOf('a') - row.indexOf('aWife'))).toBe(1);
    expect(
      layout.twins?.[layer]?.[Math.min(row.indexOf('a'), row.indexOf('b'))],
    ).toBe(2);
  });
});
