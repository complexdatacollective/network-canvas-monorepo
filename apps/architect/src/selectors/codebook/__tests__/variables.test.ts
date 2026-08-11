import { describe, expect, it } from 'vitest';

import type { RootState } from '~/ducks/modules/root';

import { getIsUsed } from '../isUsed';

const variable1 = '1234-1234-1234-1';
const variable2 = '1234-1234-1234-2';
const variable3 = '1234-1234-1234-3';
const variable4 = '1234-1234-1234-4';
const variable5 = '1234-1234-1234-5';
const variable6 = '1234-1234-1234-6';
const variable7 = '1234-1234-1234-7';
const variable8 = '1234-1234-1234-8';

const mockCodebookWithoutUse = {
  ego: {
    variables: {
      [variable5]: { name: 'v5', type: 'text' as const },
      [variable6]: { name: 'v6', type: 'text' as const },
    },
  },
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1' as const,
      variables: {
        [variable1]: { name: 'v1', type: 'text' as const },
        [variable2]: { name: 'v2', type: 'text' as const },
        [variable3]: { name: 'v3', type: 'text' as const },
        [variable4]: { name: 'v4', type: 'text' as const },
      },
    },
  },
  edge: {
    friendship: {
      name: 'Friendship',
      color: 'edge-color-seq-1' as const,
      variables: {
        [variable7]: { name: 'v7', type: 'text' as const },
        [variable8]: { name: 'v8', type: 'text' as const },
      },
    },
  },
};

const mockProtocolWithoutUse = {
  present: {
    schemaVersion: 8,
    name: 'test-protocol',
    codebook: mockCodebookWithoutUse,
    stages: [],
  },
};

const mockStateWithoutUse = {
  activeProtocol: mockProtocolWithoutUse,
  stageEditorDraft: { ui: { liveValues: null } },
};

const asState = (state: typeof mockStateWithoutUse | Record<string, unknown>) =>
  state as unknown as RootState;

describe('getIsUsed', () => {
  it('returns false when a variable is not present', () => {
    const result = getIsUsed(asState(mockStateWithoutUse));

    expect(result).toEqual({
      [variable1]: false,
      [variable2]: false,
      [variable3]: false,
      [variable4]: false,
      [variable5]: false,
      [variable6]: false,
      [variable7]: false,
      [variable8]: false,
    });
  });

  it('returns true when a variable is present at known paths in the protocol', () => {
    // Uses AlterForm stage (form.fields[].variable) and OrdinalBin stage (prompts[].variable).
    // Stages must be schema-valid so collectEntityAttributeReferences can extract references.
    const stateWithProtocolUse = {
      ...mockStateWithoutUse,
      activeProtocol: {
        ...mockProtocolWithoutUse,
        present: {
          ...mockProtocolWithoutUse.present,
          stages: [
            {
              id: 's1',
              label: 'AlterForm stage',
              type: 'AlterForm',
              subject: { entity: 'node', type: 'person' },
              introductionPanel: { title: 'Title', text: 'Text' },
              form: {
                fields: [
                  { variable: variable1, prompt: 'prompt 1' },
                  { variable: variable2, prompt: 'prompt 2' },
                ],
              },
            },
            {
              id: 's2',
              label: 'OrdinalBin stage',
              type: 'OrdinalBin',
              subject: { entity: 'node', type: 'person' },
              prompts: [{ id: 'p1', text: 'choose', variable: variable3 }],
            },
          ],
        },
      },
    };

    const result = getIsUsed(asState(stateWithProtocolUse));

    expect(result).toEqual({
      [variable1]: true,
      [variable2]: true,
      [variable3]: true,
      [variable4]: false,
      [variable5]: false,
      [variable6]: false,
      [variable7]: false,
      [variable8]: false,
    });
  });

  describe('the unsaved stage draft', () => {
    const stateWithLiveUse = {
      ...mockStateWithoutUse,
      stageEditorDraft: {
        ui: {
          liveValues: {
            [variable2]: 'foo',
            thing: {
              foo: variable3,
            },
          },
        },
      },
    };

    it('returns true for variables referenced by the live stage values', () => {
      const result = getIsUsed(asState(stateWithLiveUse));

      expect(result).toEqual({
        [variable1]: false,
        [variable2]: true,
        [variable3]: true,
        [variable4]: false,
        [variable5]: false,
        [variable6]: false,
        [variable7]: false,
        [variable8]: false,
      });
    });
  });

  it('checks codebook for variable validation use', () => {
    // variable1 has sameAs: variable2, so variable2 should be detected as used.
    // The variable must have a type field for the schema to validate it.
    const stateWithCodebookUse = {
      ...mockStateWithoutUse,
      activeProtocol: {
        ...mockProtocolWithoutUse,
        present: {
          ...mockProtocolWithoutUse.present,
          codebook: {
            ...mockCodebookWithoutUse,
            node: {
              ...mockCodebookWithoutUse.node,
              person: {
                ...mockCodebookWithoutUse.node.person,
                variables: {
                  ...mockCodebookWithoutUse.node.person.variables,
                  [variable1]: {
                    name: 'v1',
                    type: 'number' as const,
                    validation: {
                      sameAs: variable2,
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = getIsUsed(asState(stateWithCodebookUse));

    expect(result).toEqual({
      [variable1]: false,
      [variable2]: true,
      [variable3]: false,
      [variable4]: false,
      [variable5]: false,
      [variable6]: false,
      [variable7]: false,
      [variable8]: false,
    });
  });

  // `getIsUsed` recomputes on every live-value mirror tick (that reactivity
  // is the feature), but its `resultEqualityCheck` must hand back the SAME
  // map reference when the recomputed content is unchanged — the common case
  // while typing — so that selectors composed on it (variable options) and
  // `useSelector` guards keyed on its identity stay quiet.
  describe('reference identity across live-value ticks', () => {
    it('returns the identical map when only the liveValues object identity changes', () => {
      // Content-equal but referentially distinct liveValues, over the same
      // protocol reference: a debounced mirror tick that changed nothing.
      const tickA = {
        ...mockStateWithoutUse,
        stageEditorDraft: { ui: { liveValues: { draftText: 'typing' } } },
      };
      const tickB = {
        ...mockStateWithoutUse,
        stageEditorDraft: { ui: { liveValues: { draftText: 'typing' } } },
      };

      expect(getIsUsed(asState(tickB))).toBe(getIsUsed(asState(tickA)));
    });

    it('returns a new map when a tick changes which variables are used', () => {
      const before = {
        ...mockStateWithoutUse,
        stageEditorDraft: { ui: { liveValues: { draftText: 'typing' } } },
      };
      const after = {
        ...mockStateWithoutUse,
        stageEditorDraft: { ui: { liveValues: { someField: variable1 } } },
      };

      const beforeResult = getIsUsed(asState(before));
      const afterResult = getIsUsed(asState(after));

      expect(afterResult).not.toBe(beforeResult);
      expect(beforeResult[variable1]).toBe(false);
      expect(afterResult[variable1]).toBe(true);
    });
  });
});
