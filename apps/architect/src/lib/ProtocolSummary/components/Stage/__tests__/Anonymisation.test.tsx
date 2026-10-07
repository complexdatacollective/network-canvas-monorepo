import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { DEFAULT_PASSPHRASE_MIN_LENGTH } from '@codaco/shared-consts';

import SummaryContext from '../../SummaryContext';
import Anonymisation from '../Anonymisation';

const protocol = {
  schemaVersion: 9,
  name: 'Anonymisation protocol',
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
  stages: [],
} satisfies CurrentProtocol;

const renderAnonymisation = (
  validation?: { minLength?: number; maxLength?: number } | null,
) =>
  render(
    <SummaryContext.Provider
      value={{ protocol, protocolName: protocol.name, index: [] }}
    >
      <Anonymisation validation={validation} />
    </SummaryContext.Provider>,
  );

const minimumRow = () =>
  screen.getByRole('row', { name: /Minimum passphrase length/ });

describe('Protocol Summary anonymisation stage', () => {
  it('states the default minimum when the stage sets no rules', () => {
    renderAnonymisation();

    // From the constant the interview applies, so the summary cannot name a
    // length the interview does not hold participants to.
    expect(minimumRow()).toHaveTextContent(
      `${DEFAULT_PASSPHRASE_MIN_LENGTH} (default)`,
    );
    expect(
      screen.queryByRole('row', { name: /Maximum passphrase length/ }),
    ).not.toBeInTheDocument();
  });

  it('states the default minimum beside a maximum that is set on its own', () => {
    renderAnonymisation({ maxLength: 12 });

    expect(minimumRow()).toHaveTextContent(
      `${DEFAULT_PASSPHRASE_MIN_LENGTH} (default)`,
    );
    expect(
      screen.getByRole('row', { name: /Maximum passphrase length/ }),
    ).toHaveTextContent('12');
  });

  it('states the default minimum lowered to a shorter maximum', () => {
    renderAnonymisation({ maxLength: 6 });

    // The interview never holds a participant to a default minimum longer
    // than the maximum, so neither does the summary.
    expect(minimumRow()).toHaveTextContent('6 (default)');
    expect(
      screen.getByRole('row', { name: /Maximum passphrase length/ }),
    ).toHaveTextContent('6');
  });

  it('states the stage’s own minimum, even a lower one, without the default', () => {
    renderAnonymisation({ minLength: 4, maxLength: 12 });

    expect(minimumRow()).toHaveTextContent('4');
    expect(minimumRow()).not.toHaveTextContent('(default)');
  });
});
