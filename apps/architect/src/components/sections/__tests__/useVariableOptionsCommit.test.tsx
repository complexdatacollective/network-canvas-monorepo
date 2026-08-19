import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { BIOLOGICAL_SEX_OPTIONS } from '@codaco/shared-consts';

import { useVariableOptionsCommit } from '../useVariableOptionsCommit';

// A Family Pedigree owns the OPTIONS of its biological-sex attribute without
// owning the reference itself (binning family members by sex is legitimate
// authoring), so this is the shape that reaches the owned-options gate: every
// other interface-owned binding is refused earlier, by the structural-slot
// gate.
const PROTOCOL = {
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
          relationshipType: { name: 'relationshipType', type: 'categorical' },
          isActive: { name: 'isActive', type: 'boolean' },
          isGestationalCarrier: {
            name: 'isGestationalCarrier',
            type: 'boolean',
          },
          gameteRole: { name: 'gameteRole', type: 'categorical' },
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

const renderCommit = () => {
  const store = configureStore({
    reducer: { activeProtocol: (state = { present: PROTOCOL }) => state },
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
    () =>
      useVariableOptionsCommit({
        variableField: 'variable',
        originalVariableField: '_originalVariable',
        optionsField: 'variableOptions',
        subjectForRow: () => ({ entity: 'node', type: 'family_member' }),
      }),
    { wrapper },
  );
  return { onBeforeSave: result.current, dispatched };
};

describe('useVariableOptionsCommit interface-owned options', () => {
  // The refusal is pinned HERE, once, because every editor that binds an
  // interface-owned attribute now shows this same sentence from the same
  // constant. A second literal anywhere else is the drift this guards.
  it('refuses a draft that is not the canonical set, with the shared wording', async () => {
    const { onBeforeSave, dispatched } = renderCommit();
    const result = await onBeforeSave({
      variable: 'biologicalSex',
      variableOptions: BIOLOGICAL_SEX_OPTIONS.map((option) =>
        option.value === 'female' ? { ...option, label: 'Woman' } : option,
      ),
    });
    expect(result).toEqual({
      success: false,
      fieldErrors: {
        variableOptions: [
          'These options are set by the interface that uses this attribute and cannot be changed here. Close this dialog and reopen it to start from the current options.',
        ],
      },
    });
    expect(dispatched).toEqual([]);
  });

  // The question is the protocol schema's own — `optionsMatchInterfaceOwnedSet`
  // compares members, not positions — so a list that merely arrives in a
  // different order is the canonical set and must save. The gate that a
  // hand-rolled `JSON.stringify` comparison replaced refused it, for no
  // researcher-visible reason: the option list is stripped from the saved row
  // either way.
  it('accepts the canonical set in a different order, and still writes nothing', async () => {
    const { onBeforeSave, dispatched } = renderCommit();
    const result = await onBeforeSave({
      variable: 'biologicalSex',
      variableOptions: [...BIOLOGICAL_SEX_OPTIONS].toReversed(),
    });
    expect(result).toEqual({ variable: 'biologicalSex' });
    expect(dispatched).toEqual([]);
  });

  it('refuses a draft that drops a canonical option, even at the same length', async () => {
    const { onBeforeSave } = renderCommit();
    const [first, ...others] = BIOLOGICAL_SEX_OPTIONS;
    const result = await onBeforeSave({
      variable: 'biologicalSex',
      variableOptions: [first, first, ...others.slice(1)],
    });
    expect(result).toMatchObject({
      success: false,
      fieldErrors: {
        variableOptions: [expect.stringContaining('set by the interface')],
      },
    });
  });
});

describe('useVariableOptionsCommit structural-slot gate', () => {
  it('refuses a pick the interface derives from the pedigree structure', async () => {
    const { onBeforeSave } = renderCommit();
    const result = await onBeforeSave({
      variable: 'isEgo',
      variableOptions: [],
    });
    expect(result).toMatchObject({
      success: false,
      fieldErrors: {
        variable: [expect.stringContaining('cannot be used here')],
      },
    });
  });
});
