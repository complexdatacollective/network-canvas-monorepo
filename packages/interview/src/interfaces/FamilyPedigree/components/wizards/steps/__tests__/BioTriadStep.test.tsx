import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type { FramingId } from '@codaco/shared-consts';

vi.mock('~/hooks/useStageSelector', () => ({
  useStageSelector: () => undefined,
}));

vi.mock('~/forms/useProtocolForm', () => ({
  default: () => ({ fieldComponents: null }),
}));

import { FamilyPedigreeContext } from '~/interfaces/FamilyPedigree/FamilyPedigreeContext';
import {
  createFamilyPedigreeStore,
  type VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

import BioTriadStep, { BioTriadConfigProvider } from '../BioTriadStep';

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

function isDisabled(el: HTMLElement): boolean {
  return (
    el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
  );
}

function Probe() {
  const values = useFormValue(['egg-source', 'sperm-source']);
  return <div data-testid="probe">{JSON.stringify(values)}</div>;
}

describe('BioTriadStep egg/sperm mutual exclusion', () => {
  it('resets the egg parent when its person is chosen as sperm, keeps its questions visible, and disables nothing', async () => {
    const Wrapper = framingWrapper('gamete');
    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <Probe />
          <BioTriadConfigProvider
            value={{
              existingNodes: [
                { value: 'linda', label: 'Linda' },
                { value: 'robert', label: 'Robert' },
              ],
              preselection: {
                eggSource: 'linda',
                spermSource: 'robert',
                carrier: 'egg-source',
              },
            }}
          >
            <BioTriadStep />
          </BioTriadConfigProvider>
        </Form>
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toContain(
        '"egg-source":"linda"',
      );
    });

    // Egg's donor + carrier questions are visible, and no option is disabled.
    expect(screen.getByText('Was this person an egg donor?')).toBeTruthy();
    expect(
      screen.getByText('Did this person carry the pregnancy?'),
    ).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios.filter(isDisabled)).toHaveLength(0);

    // Choose Linda (the current egg parent) in the sperm selector. The egg
    // section renders first, so the second "Linda" radio is the sperm one.
    const lindaRadios = radios.filter(
      (r) => r.getAttribute('aria-label') === 'Linda',
    );
    expect(lindaRadios).toHaveLength(2);
    fireEvent.click(lindaRadios[1]!);

    await waitFor(() => {
      const text = screen.getByTestId('probe').textContent ?? '';
      // sperm-source becomes Linda; egg-source (which was Linda) is cleared.
      expect(text).toContain('"sperm-source":"linda"');
      expect(text).not.toContain('"egg-source"');
    });

    // The egg radio visually deselects (Linda no longer checked in the egg
    // selector), while it stays checked in the sperm selector.
    const lindaAfter = screen.getAllByRole('radio', { name: 'Linda' });
    expect(lindaAfter[0]?.getAttribute('aria-checked')).toBe('false');
    expect(lindaAfter[1]?.getAttribute('aria-checked')).toBe('true');

    // The egg donor + carrier questions remain visible even though the egg
    // parent was reset.
    expect(screen.getByText('Was this person an egg donor?')).toBeTruthy();
    expect(
      screen.getByText('Did this person carry the pregnancy?'),
    ).toBeTruthy();
  });

  it('drops a known egg parent from the sperm list and a known sperm parent from the egg list', () => {
    const Wrapper = framingWrapper('gamete');
    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <BioTriadConfigProvider
            value={{
              existingNodes: [
                { value: 'linda', label: 'Linda' },
                { value: 'robert', label: 'Robert' },
              ],
              gameteRoles: new Map<string, 'egg' | 'sperm'>([
                ['linda', 'egg'],
                ['robert', 'sperm'],
              ]),
              preselection: {
                eggSource: 'linda',
                spermSource: 'robert',
                carrier: 'egg-source',
              },
            }}
          >
            <BioTriadStep />
          </BioTriadConfigProvider>
        </Form>
      </Wrapper>,
    );

    // Linda (a known egg parent) is offered only in the egg selector; Robert
    // (a known sperm parent) only in the sperm selector. Each therefore appears
    // exactly once rather than in both selectors.
    expect(screen.getAllByRole('radio', { name: 'Linda' })).toHaveLength(1);
    expect(screen.getAllByRole('radio', { name: 'Robert' })).toHaveLength(1);
  });
});

describe('BioTriadStep framed terms', () => {
  it('shows gamete-framing labels (Egg Parent / Sperm Parent) under gamete framing', () => {
    const Wrapper = framingWrapper('gamete');
    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <BioTriadConfigProvider value={{}}>
            <BioTriadStep />
          </BioTriadConfigProvider>
        </Form>
      </Wrapper>,
    );

    expect(screen.getAllByText('Egg Parent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sperm Parent').length).toBeGreaterThan(0);
  });

  it('shows gendered labels (Mother / Father) under gendered framing', () => {
    const Wrapper = framingWrapper('gendered');
    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <BioTriadConfigProvider value={{}}>
            <BioTriadStep />
          </BioTriadConfigProvider>
        </Form>
      </Wrapper>,
    );

    expect(screen.getAllByText('Mother').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Father').length).toBeGreaterThan(0);
  });

  it('shows Gestational Carrier label regardless of framing', () => {
    const Wrapper = framingWrapper('gendered');
    render(
      <Wrapper>
        <Form onSubmit={() => ({ success: true })}>
          <BioTriadConfigProvider
            value={{
              preselection: { eggParentCarried: false },
            }}
          >
            <BioTriadStep />
          </BioTriadConfigProvider>
        </Form>
      </Wrapper>,
    );

    expect(screen.getAllByText('Gestational Carrier').length).toBeGreaterThan(
      0,
    );
  });
});
