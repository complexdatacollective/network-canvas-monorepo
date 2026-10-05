import { afterEach, describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  closeStageDraft,
  publishStageDraft,
} from '~/components/StageEditor/stageDraftBeacon';
import type { RootState } from '~/ducks/modules/root';

import { getIsUsed } from '../isUsed';

/**
 * The stage an editor is holding, as its chrome publishes it.
 *
 * The unsaved stage is no longer Redux state — it lives in the package's form
 * store and reaches everything else through the beacon — so a test about "a
 * variable only the unsaved stage names" says so the way the editor does.
 */
const openStageDraft = (fields: Record<string, unknown>) => {
  publishStageDraft(
    { id: 'stage-1', type: 'Information', ...fields } as unknown as Stage,
    {},
    fields,
  );
};

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
};

afterEach(() => {
  closeStageDraft();
});

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
    it('returns true for variables referenced by the live stage values', () => {
      openStageDraft({ [variable2]: 'foo', thing: { foo: variable3 } });

      const result = getIsUsed(asState(mockStateWithoutUse));

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

  // `getIsUsed` recomputes every time the editor publishes a new draft (that
  // reactivity is the feature), but its `resultEqualityCheck` must hand back
  // the SAME map reference when the recomputed content is unchanged — the
  // common case while typing — so that selectors composed on it (variable
  // options) and `useSelector` guards keyed on its identity stay quiet.
  describe('reference identity across published drafts', () => {
    it('returns the identical map when only the published draft identity changes', () => {
      openStageDraft({ draftText: 'typing' });
      const first = getIsUsed(asState(mockStateWithoutUse));
      // The same document, published again: a keystroke that changed nothing
      // about which variables are named.
      openStageDraft({ draftText: 'typing' });

      expect(getIsUsed(asState(mockStateWithoutUse))).toBe(first);
    });

    it('returns a new map when a published draft changes which variables are used', () => {
      openStageDraft({ draftText: 'typing' });
      const beforeResult = getIsUsed(asState(mockStateWithoutUse));
      openStageDraft({ someField: variable1 });
      const afterResult = getIsUsed(asState(mockStateWithoutUse));

      expect(afterResult).not.toBe(beforeResult);
      expect(beforeResult[variable1]).toBe(false);
      expect(afterResult[variable1]).toBe(true);
    });
  });
});
