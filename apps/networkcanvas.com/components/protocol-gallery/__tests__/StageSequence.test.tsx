import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StageSequence } from '~/components/protocol-gallery/StageSequence';
import { renderWithIntl } from '~/test/renderWithIntl';

describe('StageSequence', () => {
  afterEach(() => {
    cleanup();
  });

  it('lists every stage in order with its type name', () => {
    renderWithIntl(
      <StageSequence
        stages={[
          { type: 'Information', label: 'Welcome' },
          { type: 'Sociogram', label: 'Support flows - hidden' },
          { type: 'FutureInterface', label: 'Something new' },
        ]}
      />,
    );

    expect(screen.getByText('3 stages')).toBeInTheDocument();

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('01');
    expect(items[0]).toHaveTextContent('Welcome');
    expect(items[0]).toHaveTextContent('Information');
    expect(items[1]).toHaveTextContent('Support flows - hidden');
    expect(items[1]).toHaveTextContent('Sociogram');
    expect(items[2]).toHaveTextContent('FutureInterface');
  });

  it('hides the colour bar from assistive technology', () => {
    const { container } = renderWithIntl(
      <StageSequence stages={[{ type: 'EgoForm', label: 'About you' }]} />,
    );

    const bar = container.querySelector('div[aria-hidden="true"]');
    expect(bar).not.toBeNull();
    expect(bar?.children).toHaveLength(1);
  });
});
