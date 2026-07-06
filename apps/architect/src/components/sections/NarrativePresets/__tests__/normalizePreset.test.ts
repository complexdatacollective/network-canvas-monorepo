import { describe, expect, it } from 'vitest';

import { normalizePreset } from '../NarrativePresets';

describe('normalizePreset', () => {
  it('omits an empty groupVariable', () => {
    const result = normalizePreset({
      label: 'A preset',
      layoutVariable: 'layout-1',
      groupVariable: null,
    });

    expect(result).not.toHaveProperty('groupVariable');
  });

  it('keeps a populated groupVariable', () => {
    const result = normalizePreset({
      label: 'A preset',
      layoutVariable: 'layout-1',
      groupVariable: 'category-1',
    });

    expect(result).toHaveProperty('groupVariable', 'category-1');
  });

  it('strips a null edges value (toggled off) rather than persisting null', () => {
    const result = normalizePreset({
      label: 'A preset',
      layoutVariable: 'layout-1',
      edges: null,
    });

    expect(result).not.toHaveProperty('edges');
  });

  it('strips a null highlight value (toggled off) rather than persisting null', () => {
    const result = normalizePreset({
      label: 'A preset',
      layoutVariable: 'layout-1',
      highlight: null,
    });

    expect(result).not.toHaveProperty('highlight');
  });

  it('strips an empty highlight array', () => {
    const result = normalizePreset({
      label: 'A preset',
      layoutVariable: 'layout-1',
      highlight: [],
    });

    expect(result).not.toHaveProperty('highlight');
  });

  it('strips edges with an empty display array', () => {
    const result = normalizePreset({
      label: 'A preset',
      layoutVariable: 'layout-1',
      edges: { display: [] },
    });

    expect(result).not.toHaveProperty('edges');
  });

  it('keeps populated edges and highlight', () => {
    const result = normalizePreset({
      label: 'A preset',
      layoutVariable: 'layout-1',
      edges: { display: ['edge-1'] },
      highlight: ['bool-1'],
    });

    expect(result).toHaveProperty('edges', { display: ['edge-1'] });
    expect(result).toHaveProperty('highlight', ['bool-1']);
  });

  it('never produces a null edges or highlight key from a toggled-off preset', () => {
    const result = normalizePreset({
      label: 'A preset',
      layoutVariable: 'layout-1',
      groupVariable: null,
      edges: null,
      highlight: null,
    });

    expect(result).not.toHaveProperty('edges');
    expect(result).not.toHaveProperty('highlight');
    expect(result).not.toHaveProperty('groupVariable');
    expect(Object.values(result)).not.toContain(null);
  });
});
