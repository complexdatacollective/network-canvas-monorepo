import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/protocol-validation';

import { useCrossClassEditorValidate } from '../../useCrossClassEditorValidate';
import {
  tieStrengthPromptSubject,
  useOnBeforeSaveTieStrengthPrompt,
} from '../useOnBeforeSavePrompt';

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

// A census prompt over an edge type that also carries a form field. The
// cross-class gate itself is `useCrossClassEditorValidate`'s; what this
// fixture exercises is the commit's own row bookkeeping.
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

describe('useOnBeforeSaveTieStrengthPrompt saved row', () => {
  it('strips the editor-only variableOptions from the saved prompt', async () => {
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

// The editor's two save-time surfaces share `tieStrengthPromptSubject`
// precisely so they cannot judge one row against different edge types. Wired
// here with the REAL function rather than a stand-in lambda: a subject
// derivation that stopped reading `createEdge` would leave both the
// cross-class gate and the codebook write pointing at an edge type that has
// no variables, and every UI-level assertion would still pass — the gate
// would simply never fire.
describe('tieStrengthPromptSubject', () => {
  const renderValidate = (protocol: unknown) => {
    const store = configureStore({
      reducer: { activeProtocol: (state = { present: protocol }) => state },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const { result } = renderHook(
      () =>
        useCrossClassEditorValidate({
          picks: [{ path: 'edgeVariable', writerClass: 'unvalidated' }],
          subjectForRow: tieStrengthPromptSubject,
        }),
      { wrapper },
    );
    return result.current;
  };

  it('scopes the gate to the edge type the ROW names', () => {
    const validate = renderValidate(PROTOCOL_WITH_FORM_CONFLICT);
    expect(
      validate({ createEdge: 'friend', edgeVariable: 'strength' }),
    ).toEqual({
      edgeVariable:
        '"Strength" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
    });
  });

  it('does not carry that conflict onto another edge type', () => {
    const validate = renderValidate({
      ...PROTOCOL_WITH_FORM_CONFLICT,
      codebook: {
        ...PROTOCOL_WITH_FORM_CONFLICT.codebook,
        edge: {
          ...PROTOCOL_WITH_FORM_CONFLICT.codebook.edge,
          rival: {
            name: 'Rival',
            color: 'c',
            variables: {
              strength: { name: 'Rival Strength', type: 'ordinal' },
            },
          },
        },
      },
    });
    expect(
      validate({ createEdge: 'rival', edgeVariable: 'strength' }),
    ).toBeUndefined();
  });
});
