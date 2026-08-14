import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  BIOLOGICAL_SEX_OPTIONS,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import { useOnBeforeSavePrompt } from '../useOnBeforeSavePrompt';

// A categorical variable committed with minSelected: 3 and 3 options — the
// same shape CategoricalBinPrompts/__tests__/withPromptChangeHandler.test.tsx
// uses — so a draft of only 2 options contradicts its own committed
// validation rule.
const CODEBOOK = {
  node: {
    person: {
      variables: {
        colors: {
          name: 'Colors',
          type: 'categorical',
          options: [
            { label: 'Red', value: 'red' },
            { label: 'Blue', value: 'blue' },
            { label: 'Green', value: 'green' },
          ],
          validation: { minSelected: 3 },
        },
      },
    },
  },
};

const CODEBOOK_WITH_TARGET_ONLY_VARIABLE = {
  node: {
    person: {
      variables: {
        a: {
          name: 'A',
          type: 'categorical',
          options: [
            { label: 'Red', value: 'red' },
            { label: 'Blue', value: 'blue' },
          ],
          validation: { sameAs: 'b' },
        },
        b: {
          name: 'B',
          type: 'categorical',
          options: [
            { label: 'Red', value: 'red' },
            { label: 'Blue', value: 'blue' },
          ],
        },
      },
    },
  },
};

const renderOnBeforeSave = (
  codebook: unknown = CODEBOOK,
  protocol?: unknown,
) => {
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: protocol ?? { codebook } }) => state,
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const { result } = renderHook(() => useOnBeforeSavePrompt('node', 'person'), {
    wrapper,
  });
  return result.current;
};

describe('useOnBeforeSavePrompt options contradiction', () => {
  it('fails with variableOptions field errors, not a form-level error', async () => {
    const onBeforeSave = renderOnBeforeSave();
    const result = await onBeforeSave({
      variable: 'colors',
      // Fewer options than colors' committed minSelected: 3.
      variableOptions: [
        { label: 'Red', value: 'red' },
        { label: 'Blue', value: 'blue' },
      ],
    });
    expect(result).toMatchObject({
      success: false,
      fieldErrors: {
        variableOptions: [expect.stringContaining('minSelected')],
      },
    });
  });

  // A target-only variable — one that only ever appears as the target of
  // another's sameAs/comparator, never configuring rules of its own —
  // previously bypassed this check entirely, because the guard required
  // `existingVariable.validation` to already be a record.
  it('blocks a save that breaks an incoming sameAs from a target-only variable with no validation of its own', async () => {
    const onBeforeSave = renderOnBeforeSave(CODEBOOK_WITH_TARGET_ONLY_VARIABLE);
    const result = await onBeforeSave({
      variable: 'b',
      // Disjoint from a's options — breaks a's sameAs: 'b'.
      variableOptions: [
        { label: 'Green', value: 'green' },
        { label: 'Yellow', value: 'yellow' },
      ],
    });
    expect(result).toMatchObject({
      success: false,
      fieldErrors: {
        variableOptions: [expect.stringContaining('share no option values')],
      },
    });
  });
});

// The save-time cross-class gate — this bin (an UNVALIDATED writer) may not
// save a variable a form elsewhere already collects. `cat` is written both
// by an AlterForm field (validated, stage s1) and by this very
// CategoricalBin prompt (unvalidated, stage s2).
const PROTOCOL_WITH_FORM_CONFLICT = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'c',
        variables: {
          cat: {
            name: 'Cat',
            type: 'categorical',
            options: [
              { label: 'A', value: 'a' },
              { label: 'B', value: 'b' },
            ],
          },
        },
      },
    },
  },
  stages: [
    {
      id: 's1',
      type: 'AlterForm',
      label: 'F',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 'T', text: 'X' },
      form: { fields: [{ variable: 'cat', prompt: 'P' }] },
    },
    {
      id: 's2',
      type: 'CategoricalBin',
      label: 'B',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'T', variable: 'cat' }],
    },
  ],
};

describe('useOnBeforeSavePrompt cross-class gate', () => {
  it('fails at variable with the mirror message', async () => {
    const onBeforeSave = renderOnBeforeSave(
      undefined,
      PROTOCOL_WITH_FORM_CONFLICT,
    );
    const result = await onBeforeSave({
      variable: 'cat',
      variableOptions: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
    });
    expect(result).toEqual({
      success: false,
      fieldErrors: {
        variable: [
          '"Cat" is collected by a form elsewhere in this protocol, so it cannot be written by this stage (values written here would bypass its validation)',
        ],
      },
    });
  });

  it('escapes when the pick equals the prompt’s original committed variable (editing without changing)', async () => {
    const onBeforeSave = renderOnBeforeSave(
      undefined,
      PROTOCOL_WITH_FORM_CONFLICT,
    );
    const result = await onBeforeSave({
      variable: 'cat',
      _originalVariable: 'cat',
      variableOptions: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
    });
    expect(result).toMatchObject({ variable: 'cat' });
  });

  it('allows a save with no cross-class conflict', async () => {
    const formOnly = {
      ...PROTOCOL_WITH_FORM_CONFLICT,
      stages: [PROTOCOL_WITH_FORM_CONFLICT.stages[1]],
    };
    const onBeforeSave = renderOnBeforeSave(undefined, formOnly);
    const result = await onBeforeSave({
      variable: 'cat',
      variableOptions: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
      ],
    });
    expect(result).toMatchObject({ variable: 'cat' });
  });
});

// `otherVariable` is a VALIDATED writer (its follow-up input honours the
// referenced variable's codebook validation), so it carries the MIRROR gate:
// reject a pick a bin/highlight/census/etc. elsewhere already writes without
// validation.
const OTHER_VARIABLE_CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'c',
      variables: {
        cat: {
          name: 'Cat',
          type: 'categorical',
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
          ],
        },
        other: { name: 'Other', type: 'text' },
      },
    },
  },
};

// `relationshipVariable` is one of the pedigree's unvalidated node slots. The
// node label is NOT: it writes through validation, so it would not trip this
// gate.
const OTHER_UNVALIDATED_STAGE = {
  id: 's2',
  type: 'FamilyPedigree',
  label: 'P',
  nodeConfig: { type: 'person', relationshipVariable: 'other' },
};

const otherVariableProtocol = (stages: unknown[]) => ({
  schemaVersion: 8,
  codebook: OTHER_VARIABLE_CODEBOOK,
  stages,
});

const OTHER_PROMPT_VALUE = {
  variable: 'cat',
  variableOptions: [
    { label: 'A', value: 'a' },
    { label: 'B', value: 'b' },
  ],
  otherVariable: 'other',
};

describe('useOnBeforeSavePrompt otherVariable mirror gate', () => {
  it('fails at otherVariable with the mirror message', async () => {
    const onBeforeSave = renderOnBeforeSave(
      undefined,
      otherVariableProtocol([OTHER_UNVALIDATED_STAGE]),
    );
    const result = await onBeforeSave(OTHER_PROMPT_VALUE);
    expect(result).toEqual({
      success: false,
      fieldErrors: {
        otherVariable: [
          '"Other" is written without validation by another stage, so it cannot be used as a form field',
        ],
      },
    });
  });

  it('escapes when the pick equals the prompt’s original committed otherVariable', async () => {
    const onBeforeSave = renderOnBeforeSave(
      undefined,
      otherVariableProtocol([OTHER_UNVALIDATED_STAGE]),
    );
    const result = await onBeforeSave({
      ...OTHER_PROMPT_VALUE,
      _originalOtherVariable: 'other',
    });
    expect(result).toMatchObject({ otherVariable: 'other' });
  });

  it('never re-adds an absent otherVariable key (a brand new row, "Other" never touched)', async () => {
    const onBeforeSave = renderOnBeforeSave(
      undefined,
      otherVariableProtocol([]),
    );
    const { otherVariable: _unused, ...withoutOther } = OTHER_PROMPT_VALUE;
    const result = await onBeforeSave(withoutOther);
    expect(result).not.toHaveProperty('otherVariable');
  });
});

// A Family Pedigree derives its structural values from the tree the
// participant draws and reads the exact option VALUES back in its genetics
// engine. Binding the biological-sex variable to a bin is legitimate — sorting
// family members by sex is a real research need — but rewriting its options is
// not, and the bin used to do exactly that on every save.
const PROTOCOL_WITH_PEDIGREE = {
  schemaVersion: 8,
  codebook: {
    node: {
      family_member: {
        name: 'Family member',
        color: 'c',
        variables: {
          fmName: { name: 'fm_name', type: 'text', component: 'Text' },
          isEgo: { name: 'is_ego', type: 'boolean' },
          relationshipToEgo: { name: 'fm_relationship_to_ego', type: 'text' },
          biologicalSex: {
            name: 'biologicalSex',
            type: 'categorical',
            options: BIOLOGICAL_SEX_OPTIONS,
          },
        },
      },
    },
    edge: {
      family_edge: {
        name: 'Family edge',
        color: 'c',
        variables: {
          relationshipType: {
            name: 'relationshipType',
            type: 'categorical',
            options: RELATIONSHIP_TYPE_OPTIONS,
          },
          isActive: { name: 'isActive', type: 'boolean' },
          isGestationalCarrier: {
            name: 'isGestationalCarrier',
            type: 'boolean',
          },
          gameteRole: {
            name: 'gameteRole',
            type: 'categorical',
            options: GAMETE_ROLE_OPTIONS,
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
        type: 'family_member',
        nodeLabelVariable: 'fmName',
        egoVariable: 'isEgo',
        relationshipVariable: 'relationshipToEgo',
        biologicalSexVariable: 'biologicalSex',
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

const renderPedigreeOnBeforeSave = () => {
  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: PROTOCOL_WITH_PEDIGREE }) => state,
    },
  });
  const dispatched: unknown[] = [];
  const originalDispatch = store.dispatch.bind(store);
  store.dispatch = ((action: unknown) => {
    dispatched.push(action);
    return originalDispatch(action as never);
  }) as typeof store.dispatch;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const { result } = renderHook(
    () => useOnBeforeSavePrompt('node', 'family_member'),
    { wrapper },
  );
  return { onBeforeSave: result.current, dispatched };
};

describe('useOnBeforeSavePrompt interface-owned options', () => {
  it('saves without writing the codebook when the options are unchanged', async () => {
    const { onBeforeSave, dispatched } = renderPedigreeOnBeforeSave();
    const result = await onBeforeSave({
      variable: 'biologicalSex',
      variableOptions: BIOLOGICAL_SEX_OPTIONS,
    });
    expect(result).toMatchObject({ variable: 'biologicalSex' });
    expect(dispatched).toEqual([]);
  });

  it('refuses a stale draft that changed them, rather than invalidating the protocol', async () => {
    const { onBeforeSave, dispatched } = renderPedigreeOnBeforeSave();
    const result = await onBeforeSave({
      variable: 'biologicalSex',
      variableOptions: BIOLOGICAL_SEX_OPTIONS.map((option) =>
        option.value === 'female' ? { ...option, label: 'Woman' } : option,
      ),
    });
    expect(result).toMatchObject({
      success: false,
      fieldErrors: {
        variableOptions: [expect.stringContaining('set by the interface')],
      },
    });
    expect(dispatched).toEqual([]);
  });
});
