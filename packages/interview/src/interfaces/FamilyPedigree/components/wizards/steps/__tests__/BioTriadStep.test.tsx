import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

import BioTriadStep, { BioTriadConfigProvider } from '../BioTriadStep';

function isDisabled(el: HTMLElement): boolean {
  return (
    el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
  );
}

describe('BioTriadStep mutual exclusion', () => {
  it('disables the egg parent in the sperm selector (and vice versa)', async () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
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

    // egg-source = Alice, sperm-source = Bob. Each selector lists Alice, Bob,
    // and "Create a new person". Exactly two options must be disabled: Alice in
    // the sperm selector and Bob in the egg selector.
    await waitFor(() => {
      const radios = screen.getAllByRole('radio');
      const disabled = radios.filter(isDisabled);
      expect(disabled).toHaveLength(2);
      const disabledLabels = disabled
        .map((r) => r.getAttribute('aria-label'))
        .sort();
      expect(disabledLabels).toEqual(['Alice', 'Bob']);
    });
  });
});
