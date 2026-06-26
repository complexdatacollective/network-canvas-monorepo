import { render, screen } from '@testing-library/react';
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

vi.mock('~/forms/useProtocolForm', () => ({
  default: () => ({ fieldComponents: null }),
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
};

function framingWrapper(framing: FramingId) {
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
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <FamilyPedigreeContext.Provider value={store}>
        {children}
      </FamilyPedigreeContext.Provider>
    );
  };
}

// Imports are deferred below the mocks so that vi.mock hoisting takes effect.
import BioParentsIntroStep from '../BioParentsIntroStep';
import EggParentStep from '../EggParentStep';
import GestationalCarrierStep from '../GestationalCarrierStep';
import SpermParentStep from '../SpermParentStep';

describe('EggParentStep framed terms', () => {
  it('shows gamete intro copy (egg parent) under gamete framing', () => {
    const Wrapper = framingWrapper('gamete');
    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <EggParentStep />
        </Form>
      </Wrapper>,
    );

    expect(screen.getByText(/egg parent/i)).toBeTruthy();
  });

  it('shows gendered intro copy (mother) under gendered framing', () => {
    const Wrapper = framingWrapper('gendered');
    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <EggParentStep />
        </Form>
      </Wrapper>,
    );

    expect(screen.getByText(/mother/i)).toBeTruthy();
  });
});

describe('SpermParentStep framed terms', () => {
  it('shows gamete intro copy (sperm parent) under gamete framing', () => {
    const Wrapper = framingWrapper('gamete');
    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <SpermParentStep />
        </Form>
      </Wrapper>,
    );

    expect(screen.getByText(/sperm parent/i)).toBeTruthy();
  });

  it('shows gendered intro copy (father) under gendered framing', () => {
    const Wrapper = framingWrapper('gendered');
    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <SpermParentStep />
        </Form>
      </Wrapper>,
    );

    expect(screen.getByText(/father/i)).toBeTruthy();
  });
});

describe('GestationalCarrierStep framing invariance', () => {
  it('reads "Gestational Carrier" under gamete framing', () => {
    const Wrapper = framingWrapper('gamete');
    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <GestationalCarrierStep />
        </Form>
      </Wrapper>,
    );

    expect(screen.getByText(/gestational carrier/i)).toBeTruthy();
  });

  it('reads "Gestational Carrier" under gendered framing', () => {
    const Wrapper = framingWrapper('gendered');
    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <GestationalCarrierStep />
        </Form>
      </Wrapper>,
    );

    expect(screen.getByText(/gestational carrier/i)).toBeTruthy();
  });
});

describe('BioParentsIntroStep framed headings', () => {
  it('shows "Egg Parent" and "Sperm Parent" headings under gamete framing', () => {
    const Wrapper = framingWrapper('gamete');
    render(
      <Wrapper>
        <BioParentsIntroStep />
      </Wrapper>,
    );

    expect(screen.getByText('Egg Parent')).toBeTruthy();
    expect(screen.getByText('Sperm Parent')).toBeTruthy();
  });

  it('shows "Mother" and "Father" headings under gendered framing', () => {
    const Wrapper = framingWrapper('gendered');
    render(
      <Wrapper>
        <BioParentsIntroStep />
      </Wrapper>,
    );

    expect(screen.getByText('Mother')).toBeTruthy();
    expect(screen.getByText('Father')).toBeTruthy();
  });
});
