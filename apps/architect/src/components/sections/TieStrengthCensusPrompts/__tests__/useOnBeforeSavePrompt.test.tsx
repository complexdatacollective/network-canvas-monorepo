import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import { useOnBeforeSaveTieStrengthPrompt } from '../useOnBeforeSavePrompt';

// `a` carries the sameAs rule; `b` is a target-only variable — it never
// configures rules of its own, so it has no `validation` key at all.
// Ordinal (not categorical) because that is the only variable type the
// Tie-Strength Census editor's VariablePicker offers for `edgeVariable`.
const CODEBOOK_WITH_TARGET_ONLY_VARIABLE = {
  edge: {
    friend: {
      variables: {
        a: {
          name: 'A',
          type: 'ordinal',
          options: [
            { label: 'Weak', value: 'weak' },
            { label: 'Strong', value: 'strong' },
          ],
          validation: { sameAs: 'b' },
        },
        b: {
          name: 'B',
          type: 'ordinal',
          options: [
            { label: 'Weak', value: 'weak' },
            { label: 'Strong', value: 'strong' },
          ],
        },
      },
    },
  },
};

const renderOnBeforeSave = (protocol: unknown) => {
  const store = configureStore({
    reducer: { activeProtocol: (state = { present: protocol }) => state },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const { result } = renderHook(() => useOnBeforeSaveTieStrengthPrompt(), {
    wrapper,
  });
  return result.current;
};

describe('useOnBeforeSaveTieStrengthPrompt options contradiction', () => {
  it('blocks a save that breaks an incoming sameAs from a target-only edge variable with no validation of its own', async () => {
    const onBeforeSave = renderOnBeforeSave({
      codebook: CODEBOOK_WITH_TARGET_ONLY_VARIABLE,
    });
    const result = await onBeforeSave({
      createEdge: 'friend',
      edgeVariable: 'b',
      // Disjoint from a's options — breaks a's sameAs: 'b'.
      variableOptions: [
        { label: 'Other', value: 'other' },
        { label: 'Different', value: 'different' },
      ],
    });
    expect(result).toMatchObject({
      success: false,
      fieldErrors: {
        variableOptions: [expect.stringContaining('share no option values')],
      },
    });
  });

  it('allows a save that keeps the sameAs group satisfiable', async () => {
    const onBeforeSave = renderOnBeforeSave({
      codebook: CODEBOOK_WITH_TARGET_ONLY_VARIABLE,
    });
    const result = await onBeforeSave({
      createEdge: 'friend',
      edgeVariable: 'b',
      // Overlaps a's options — a's sameAs: 'b' stays satisfiable.
      variableOptions: [
        { label: 'Weak', value: 'weak' },
        { label: 'Medium', value: 'medium' },
      ],
    });
    expect(result).toMatchObject({ edgeVariable: 'b', createEdge: 'friend' });
  });
});

// The save-time cross-class gate — this census prompt (an UNVALIDATED
// writer) may not save an edgeVariable a form elsewhere already collects.
// `strength` is written both by an AlterEdgeForm field (validated, stage s1)
// and by this very TieStrengthCensus prompt (unvalidated, stage s2), scoped
// to the edge type ('friend') this PROMPT'S OWN createEdge names.
const PROTOCOL_WITH_FORM_CONFLICT = {
  schemaVersion: 8,
  codebook: {
    edge: {
      friend: {
        name: 'Friend',
        color: 'c',
        variables: {
          strength: {
            name: 'Strength',
            type: 'ordinal',
            options: [
              { label: 'Weak', value: 'weak' },
              { label: 'Strong', value: 'strong' },
            ],
          },
        },
      },
    },
    node: {
      person: { name: 'Person', color: 'c', variables: {} },
    },
  },
  stages: [
    {
      id: 's1',
      type: 'AlterEdgeForm',
      label: 'F',
      subject: { entity: 'edge', type: 'friend' },
      introductionPanel: { title: 'T', text: 'X' },
      form: { fields: [{ variable: 'strength', prompt: 'P' }] },
    },
    {
      id: 's2',
      type: 'TieStrengthCensus',
      label: 'C',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'T', text: 'X' },
      prompts: [
        {
          id: 'p1',
          text: 'T',
          createEdge: 'friend',
          edgeVariable: 'strength',
          negativeLabel: 'None',
        },
      ],
    },
  ],
};

describe('useOnBeforeSaveTieStrengthPrompt cross-class gate', () => {
  it('fails at edgeVariable with the mirror message', async () => {
    const onBeforeSave = renderOnBeforeSave(PROTOCOL_WITH_FORM_CONFLICT);
    const result = await onBeforeSave({
      createEdge: 'friend',
      edgeVariable: 'strength',
      variableOptions: [
        { label: 'Weak', value: 'weak' },
        { label: 'Strong', value: 'strong' },
      ],
    });
    expect(result).toEqual({
      success: false,
      fieldErrors: {
        edgeVariable: [
          '"Strength" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
        ],
      },
    });
  });

  it('escapes when the pick equals the prompt’s original committed edgeVariable', async () => {
    const onBeforeSave = renderOnBeforeSave(PROTOCOL_WITH_FORM_CONFLICT);
    const result = await onBeforeSave({
      createEdge: 'friend',
      edgeVariable: 'strength',
      _originalEdgeVariable: 'strength',
      variableOptions: [
        { label: 'Weak', value: 'weak' },
        { label: 'Strong', value: 'strong' },
      ],
    });
    expect(result).toMatchObject({
      edgeVariable: 'strength',
      createEdge: 'friend',
    });
  });

  it('allows a save with no cross-class conflict', async () => {
    const censusOnly = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [PROTOCOL_WITH_FORM_CONFLICT.stages[1]],
    };
    const onBeforeSave = renderOnBeforeSave(censusOnly);
    const result = await onBeforeSave({
      createEdge: 'friend',
      edgeVariable: 'strength',
      variableOptions: [
        { label: 'Weak', value: 'weak' },
        { label: 'Strong', value: 'strong' },
      ],
    });
    expect(result).toMatchObject({
      edgeVariable: 'strength',
      createEdge: 'friend',
    });
  });

  it('strips variableOptions and _originalEdgeVariable from the saved prompt', async () => {
    const censusOnly = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [PROTOCOL_WITH_FORM_CONFLICT.stages[1]],
    };
    const onBeforeSave = renderOnBeforeSave(censusOnly);
    const result = await onBeforeSave({
      id: 'p1',
      text: 'T',
      createEdge: 'friend',
      edgeVariable: 'strength',
      negativeLabel: 'None',
      _originalEdgeVariable: 'strength',
      variableOptions: [
        { label: 'Weak', value: 'weak' },
        { label: 'Strong', value: 'strong' },
      ],
    });
    expect(result).toEqual({
      id: 'p1',
      text: 'T',
      createEdge: 'friend',
      edgeVariable: 'strength',
      negativeLabel: 'None',
    });
  });
});

// A Family Pedigree derives its edge slots from the tree the participant
// draws and reads their exact values back in its genetics engine, so a census
// prompt may not write one — and, because the prompt names its own edge type,
// the gate has to be scoped to THAT type rather than the stage's subject.
const PROTOCOL_WITH_PEDIGREE_EDGE = {
  schemaVersion: 8,
  codebook: {
    node: { person: { name: 'Person', color: 'c', variables: {} } },
    edge: {
      family_edge: {
        name: 'Family edge',
        color: 'c',
        variables: {
          relationshipType: {
            name: 'Relationship type',
            type: 'categorical',
            options: RELATIONSHIP_TYPE_OPTIONS,
          },
          isActive: { name: 'Is active', type: 'boolean' },
          isGestationalCarrier: {
            name: 'Gestational carrier',
            type: 'boolean',
          },
          gameteRole: {
            name: 'Gamete role',
            type: 'categorical',
            options: GAMETE_ROLE_OPTIONS,
          },
          strength: {
            name: 'Strength',
            type: 'ordinal',
            options: [
              { label: 'Weak', value: 'weak' },
              { label: 'Strong', value: 'strong' },
            ],
          },
        },
      },
    },
  },
  stages: [
    {
      id: 'fp1',
      type: 'FamilyPedigree',
      label: 'Family Pedigree',
      nodeConfig: {
        type: 'person',
        nodeLabelVariable: 'n1',
        egoVariable: 'n2',
        relationshipVariable: 'n3',
        biologicalSexVariable: 'n4',
      },
      edgeConfig: {
        type: 'family_edge',
        relationshipTypeVariable: 'relationshipType',
        isActiveVariable: 'isActive',
        isGestationalCarrierVariable: 'isGestationalCarrier',
        gameteRoleVariable: 'gameteRole',
      },
      censusPrompt: 'Build your family',
      framing: { mode: 'fixed', value: 'gamete' },
      boundaries: {
        requireGrandparents: 'off',
        requireChildrenContributors: 'off',
      },
    },
  ],
};

describe('useOnBeforeSaveTieStrengthPrompt interface-owned gate', () => {
  it('refuses an edgeVariable the pedigree derives structurally, naming the owner', async () => {
    const onBeforeSave = renderOnBeforeSave(PROTOCOL_WITH_PEDIGREE_EDGE);
    const result = await onBeforeSave({
      createEdge: 'family_edge',
      edgeVariable: 'relationshipType',
      variableOptions: RELATIONSHIP_TYPE_OPTIONS,
    });
    expect(result).toMatchObject({
      success: false,
      fieldErrors: {
        edgeVariable: [expect.stringContaining('cannot be used here')],
      },
    });
  });

  // The gate is scoped to the edge type the PROMPT names: an identically-named
  // variable on a different edge type is a different attribute entirely.
  it('leaves an ordinary variable on the same edge type saveable', async () => {
    const onBeforeSave = renderOnBeforeSave(PROTOCOL_WITH_PEDIGREE_EDGE);
    const result = await onBeforeSave({
      createEdge: 'family_edge',
      edgeVariable: 'strength',
      variableOptions: [
        { label: 'Weak', value: 'weak' },
        { label: 'Strong', value: 'strong' },
      ],
    });
    expect(result).toMatchObject({
      edgeVariable: 'strength',
      createEdge: 'family_edge',
    });
  });
});
