import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderWithIntl } from '~/test/renderWithIntl';

import { CompatibilityNotice } from '../CompatibilityNotice';

afterEach(cleanup);

describe('CompatibilityNotice', () => {
  it('renders the approved copy as a polite warning status', () => {
    renderWithIntl(<CompatibilityNotice />);

    const warning = screen.getByRole('status');
    const title = screen.getByRole('heading', {
      level: 4,
      name: 'Classic compatibility is one-way.',
    });
    const description = screen.getByText(
      'Architect can upgrade a schema 7 protocol to schema 8, but schema 8 protocols cannot be opened in Classic apps. Keep the original file if your study still depends on Classic.',
    );

    expect(warning).toHaveTextContent('Classic compatibility is one-way.');
    expect(warning).toHaveTextContent(
      'Architect can upgrade a schema 7 protocol to schema 8, but schema 8 protocols cannot be opened in Classic apps. Keep the original file if your study still depends on Classic.',
    );
    expect(warning).toContainElement(title);
    expect(warning).toContainElement(description);
    expect(description).toHaveClass('font-body');
    expect(
      title.compareDocumentPosition(description) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders the warning in Spanish', () => {
    renderWithIntl(<CompatibilityNotice />, 'es');

    expect(
      screen.getByText('La compatibilidad con Classic es unidireccional.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/los protocolos de esquema 8 no se pueden abrir/i),
    ).toBeInTheDocument();
  });
});
