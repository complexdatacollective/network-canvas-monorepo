import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import type { FramingId } from '@codaco/shared-consts';

import { FamilyPedigreeContext } from '../../../../FamilyPedigreeContext';
import {
  createFamilyPedigreeStore,
  type VariableConfig,
} from '../../../../store';

vi.mock('../../../../../../hooks/useStageSelector', () => ({
  useStageSelector: () => undefined,
}));

vi.mock('../../../../../../forms/useProtocolForm', () => ({
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
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
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

// Deferred below the mocks so vi.mock hoisting takes effect.
import BioTriadStep, { BioTriadConfigProvider } from '../BioTriadStep';

const config = {
  existingNodes: [
    { value: 'a', label: 'Alex' },
    { value: 'b', label: 'Bailey' },
  ],
  preselection: {},
};

function renderTriad(framing: FramingId) {
  const Wrapper = framingWrapper(framing);
  render(
    <Wrapper>
      <Form onSubmit={() => ({ success: true })}>
        <BioTriadConfigProvider value={config}>
          <BioTriadStep />
        </BioTriadConfigProvider>
      </Form>
    </Wrapper>,
  );
}

// The gamete-provider questions are the ones that previously leaked "egg"/
// "sperm" wording under the gendered framing because they were hardcoded rather
// than read from FRAMING_TERMS. This asserts the step actually USES the framed
// terms — not just that the terms exist.
describe('BioTriadStep gamete-provider framing', () => {
  it('asks "Who provided the egg/sperm?" under the gamete framing', () => {
    renderTriad('gamete');
    expect(screen.getByText('Who provided the egg?')).toBeTruthy();
    expect(screen.getByText('Who provided the sperm?')).toBeTruthy();
  });

  it('asks "Who is the biological mother/father?" — never egg/sperm — under the gendered framing', () => {
    renderTriad('gendered');
    expect(screen.getByText('Who is the biological mother?')).toBeTruthy();
    expect(screen.getByText('Who is the biological father?')).toBeTruthy();
    expect(screen.queryByText('Who provided the egg?')).toBeNull();
    expect(screen.queryByText('Who provided the sperm?')).toBeNull();
  });
});
