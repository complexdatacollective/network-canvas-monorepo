import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { compatibilityWarning } from '~/lib/getStarted';

import { CompatibilityNotice } from '../CompatibilityNotice';

afterEach(cleanup);

describe('CompatibilityNotice', () => {
  it('renders the approved copy as a polite warning status', () => {
    render(<CompatibilityNotice notice={compatibilityWarning} />);

    const warning = screen.getByRole('status');

    expect(warning).toHaveTextContent('Classic compatibility is one-way.');
    expect(warning).toHaveTextContent(
      'Architect can upgrade a schema 7 protocol to schema 8, but schema 8 protocols cannot be opened in Classic apps. Keep the original file if your study still depends on Classic.',
    );
  });
});
