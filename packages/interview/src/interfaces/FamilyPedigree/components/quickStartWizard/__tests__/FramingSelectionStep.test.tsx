import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
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
  it('renders both framing options', () => {
    const { Wrapper } = framingWrapper(null);
    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <FramingSelectionStep />
        </Form>
      </Wrapper>,
    );

    expect(screen.getByText(/gamete.based/i)).toBeTruthy();
    expect(screen.getByText(/gendered/i)).toBeTruthy();
  });

  it('calls setFraming with "gendered" when the gendered option is selected', () => {
    const { Wrapper, store } = framingWrapper(null);

    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <FramingSelectionStep />
        </Form>
      </Wrapper>,
    );

    const genderedInput = screen.getByRole('radio', { name: /gendered/i });
    fireEvent.click(genderedInput);

    expect(store.getState().framing).toBe('gendered');
  });

  it('calls setFraming with "gamete" when the gamete option is selected', () => {
    const { Wrapper, store } = framingWrapper(null);

    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <FramingSelectionStep />
        </Form>
      </Wrapper>,
    );

    const gameteInput = screen.getByRole('radio', { name: /gamete.based/i });
    fireEvent.click(gameteInput);

    expect(store.getState().framing).toBe('gamete');
  });
});
