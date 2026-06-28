import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FramingId } from '@codaco/shared-consts';
import { FamilyPedigreeContext } from '~/interfaces/FamilyPedigree/FamilyPedigreeContext';
import {
  createFamilyPedigreeStore,
  type VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

vi.mock('~/hooks/useStageSelector', () => ({
  useStageSelector: () => undefined,
}));

const testConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'label',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'relationshipType',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGestationalCarrier',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

function framingWrapper(framing: FramingId | null) {
  const store = createFamilyPedigreeStore(
    new Map(),
    new Map(),
    new Map(),
    testConfig,
    undefined,
    undefined,
    undefined,
    undefined,
    framing,
  );
  return {
    store,
    Wrapper: function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <FamilyPedigreeContext.Provider value={store}>
          {children}
        </FamilyPedigreeContext.Provider>
      );
    },
  };
}

import { FramingSelectionStep } from '../FramingSelectionStep';

describe('FramingSelectionStep', () => {
  it('renders both framing options with participant-friendly copy', () => {
    const { Wrapper } = framingWrapper(null);
    render(
      <Wrapper>
        <FramingSelectionStep />
      </Wrapper>,
    );

    expect(screen.getByText('Egg parent & sperm parent')).toBeTruthy();
    expect(screen.getByText('Mother & father')).toBeTruthy();
  });

  it('calls setFraming with "gendered" when the mother & father option is selected', () => {
    const { Wrapper, store } = framingWrapper(null);

    render(
      <Wrapper>
        <FramingSelectionStep />
      </Wrapper>,
    );

    const genderedOption = screen.getByRole('option', {
      name: /mother & father/i,
    });
    fireEvent.click(genderedOption);

    expect(store.getState().framing).toBe('gendered');
  });

  it('calls setFraming with "gamete" when the egg parent & sperm parent option is selected', () => {
    const { Wrapper, store } = framingWrapper(null);

    render(
      <Wrapper>
        <FramingSelectionStep />
      </Wrapper>,
    );

    const gameteOption = screen.getByRole('option', {
      name: /egg parent & sperm parent/i,
    });
    fireEvent.click(gameteOption);

    expect(store.getState().framing).toBe('gamete');
  });
});
