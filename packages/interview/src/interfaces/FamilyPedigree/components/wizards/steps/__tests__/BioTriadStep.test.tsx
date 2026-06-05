import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';

import BioTriadStep, { BioTriadConfigProvider } from '../BioTriadStep';

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
  it('clears the opposite field when its person is chosen here, and disables nothing', async () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <Probe />
        <BioTriadConfigProvider
          value={{
            existingNodes: [
              { value: 'a', label: 'Alice' },
              { value: 'b', label: 'Bob' },
            ],
            preselection: {
              eggSource: 'a',
              spermSource: 'b',
              carrier: 'egg-source',
            },
          }}
        >
          <BioTriadStep />
        </BioTriadConfigProvider>
      </Form>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toContain(
        '"egg-source":"a"',
      );
    });

    // Every person stays selectable in both selectors — nothing is disabled.
    const radios = screen.getAllByRole('radio');
    expect(radios.filter(isDisabled)).toHaveLength(0);

    // Choose Alice (the current egg parent) in the sperm selector. The egg
    // section renders first, so the second "Alice" radio is the sperm one.
    const aliceRadios = radios.filter(
      (r) => r.getAttribute('aria-label') === 'Alice',
    );
    expect(aliceRadios).toHaveLength(2);
    fireEvent.click(aliceRadios[1]!);

    // sperm-source becomes Alice; egg-source (which was Alice) is cleared — a
    // cleared value is undefined, so JSON.stringify drops the key entirely.
    await waitFor(() => {
      const text = screen.getByTestId('probe').textContent ?? '';
      expect(text).toContain('"sperm-source":"a"');
      expect(text).not.toContain('"egg-source"');
    });
  });
});
