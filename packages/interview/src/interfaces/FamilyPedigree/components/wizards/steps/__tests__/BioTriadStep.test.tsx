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
  it('resets the egg parent when its person is chosen as sperm, keeps its questions visible, and disables nothing', async () => {
    render(
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
      </Form>,
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
});
