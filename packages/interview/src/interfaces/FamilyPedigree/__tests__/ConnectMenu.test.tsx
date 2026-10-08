import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import ConnectMenu from '../components/ConnectMenu';
import { readFamily } from '../model';
import { config, person } from './fixtures';

const PARENT_KIND_LABELS = {
  biological: 'Biological parent',
  adoptive: 'Adoptive parent',
  social: 'Step or social parent',
  donor: '*Egg* or sperm donor',
  surrogate: 'Surrogate',
};

describe('ConnectMenu', () => {
  it('shows the codebook’s kinds of parent as markdown, and announces their text', async () => {
    const family = readFamily(
      [person('julie', { name: 'Julie' }), person('rob', { name: 'Rob' })],
      [],
      config,
    );
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const onConnect = vi.fn();

    render(
      <TestProtocolLocalization>
        <ConnectMenu
          pair={{ firstId: 'julie', secondId: 'rob' }}
          family={family}
          displayName={(id) => (id === 'julie' ? 'Julie' : 'Rob')}
          parentKindLabels={PARENT_KIND_LABELS}
          anchor={anchor}
          onConnect={onConnect}
          onClose={() => undefined}
        />
      </TestProtocolLocalization>,
    );

    await userEvent.click(
      await screen.findByRole('menuitem', {
        name: '“Julie” is a parent of “Rob”',
      }),
    );
    const donor = await screen.findByTestId('pedigree-connect-kind-donor');
    expect(donor.querySelector('em')).toHaveTextContent('Egg');
    expect(donor).toHaveTextContent('Egg or sperm donor');
    expect(donor).not.toHaveTextContent('*');

    await userEvent.click(donor);
    expect(onConnect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'parent', parentKind: 'donor' }),
      '“Julie” is a parent of “Rob” (Egg or sperm donor)',
    );
  });
});
