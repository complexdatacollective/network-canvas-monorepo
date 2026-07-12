import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { compatibilityWarning } from '~/lib/getStarted';

import { CompatibilityNotice } from '../CompatibilityNotice';

afterEach(cleanup);

describe('CompatibilityNotice', () => {
  it('renders the approved copy as a polite warning status', () => {
    render(<CompatibilityNotice notice={compatibilityWarning} />);

    const warning = screen.getByRole('status');
    const title = screen.getByRole('heading', {
      level: 4,
      name: compatibilityWarning.title,
    });
    const description = screen.getByText(compatibilityWarning.description);

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
});
