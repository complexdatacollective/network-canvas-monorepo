import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Markdown from './Markdown';

describe('Markdown', () => {
  it('renders emphasis and list markdown', () => {
    const { container } = render(
      <Markdown label={'**bold** text\n\n- one\n- two'} />,
    );

    expect(container.querySelector('strong')).toHaveTextContent('bold');

    const items = container.querySelectorAll('ul li');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('one');
    expect(items[1]).toHaveTextContent('two');
  });

  it('does not turn a legacy `>` prefix into a blockquote', () => {
    const { container } = render(<Markdown label="> legacy quote" />);

    expect(container.querySelector('blockquote')).toBeNull();
    expect(container.textContent).toContain('> legacy quote');
  });

  it('forwards className to the wrapping element', () => {
    const { container } = render(
      <Markdown label="prompt" className="[&>p]:m-0" />,
    );

    const wrapper = container.querySelector('span');
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveClass('[&>p]:m-0');
  });
});
