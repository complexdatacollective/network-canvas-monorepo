import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { compatibilityWarning } from '~/lib/getStarted';

import { CompatibilityNotice } from '../CompatibilityNotice';

afterEach(cleanup);

describe('CompatibilityNotice', () => {
  it('renders the approved informational warning copy', () => {
    render(<CompatibilityNotice notice={compatibilityWarning} />);

    expect(screen.getByText(compatibilityWarning.title)).toBeInTheDocument();
    expect(
      screen.getByText(compatibilityWarning.description),
    ).toBeInTheDocument();
  });
});
