import { describe, expect, it } from 'vitest';

import { hasEdgeRules, stripEdgeRules } from '../NodePanel';

const alterRule = { type: 'alter', id: 'a1' };
const edgeRule = { type: 'edge', id: 'e1' };

describe('hasEdgeRules', () => {
  it.each([
    ['a null filter', null, false],
    ['a filter with no rules', { rules: [] }, false],
    ['a filter with only alter rules', { rules: [alterRule] }, false],
    ['a filter with an edge rule', { rules: [alterRule, edgeRule] }, true],
  ])('is %s → %s', (_label, filter, expected) => {
    expect(hasEdgeRules(filter)).toBe(expected);
  });
});

describe('stripEdgeRules', () => {
  it('removes edge rules and keeps the rest of the filter intact', () => {
    expect(
      stripEdgeRules({ join: 'AND', rules: [alterRule, edgeRule] }),
    ).toEqual({ join: 'AND', rules: [alterRule] });
  });

  it('clears the filter entirely when every rule was an edge rule', () => {
    expect(stripEdgeRules({ join: 'AND', rules: [edgeRule] })).toBeNull();
  });

  it('leaves a filter with no edge rules unchanged', () => {
    expect(stripEdgeRules({ join: 'AND', rules: [alterRule] })).toEqual({
      join: 'AND',
      rules: [alterRule],
    });
  });

  it('handles a null filter', () => {
    expect(stripEdgeRules(null)).toBeNull();
  });
});
