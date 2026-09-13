import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Hint from './Hint';

/** The hint is a plain `div` carrying its own id, so read it back by that. */
const hintElement = () => document.getElementById('hint');

describe('Hint', () => {
  it('renders children when no hint is given, as markdown', () => {
    render(<Hint id="hint">Read the **manual**</Hint>);

    expect(hintElement()).toHaveTextContent('Read the manual');
    expect(screen.getByText('manual').tagName).toBe('STRONG');
  });

  it('prefers the hint prop over children', () => {
    render(
      <Hint id="hint" hint="From the prop">
        Ignored
      </Hint>,
    );

    expect(hintElement()).toHaveTextContent('From the prop');
    expect(hintElement()).not.toHaveTextContent('Ignored');
  });

  it('shows the hint and the validation summary together', () => {
    render(
      <Hint id="hint" hint="From the prop" validationSummary="Must be a URL" />,
    );

    expect(hintElement()).toHaveTextContent('From the prop');
    expect(hintElement()).toHaveTextContent('Must be a URL');
  });
});
