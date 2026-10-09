import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { resolveInterviewIntl } from '../../../i18n/resolveIntl';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import ConnectMenu, { describeConnection } from '../components/ConnectMenu';
import { readFamily } from '../model';
import { config, link, person } from './fixtures';

const intl = resolveInterviewIntl();

const SEX_LABELS = {
  female: 'Female',
  male: 'Male',
  intersex: 'Intersex',
  unknown: 'Don’t know',
  preferNotToSay: 'Prefer not to say',
};

const PARENT_KIND_LABELS = {
  biological: 'Genetic parent',
  adoptive: 'Adoptive parent',
  social: 'Step or social parent',
  donor: '*Egg* or sperm donor',
  surrogate: 'Surrogate',
};

describe('ConnectMenu', () => {
  it('names every kind of parent by the codebook’s label, shown as markdown and announced as text', async () => {
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
          sexLabels={SEX_LABELS}
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
    expect(
      screen.getByTestId('pedigree-connect-kind-biological-carrier'),
    ).toHaveTextContent('Genetic parent (carried the pregnancy)');

    await userEvent.click(donor);
    expect(onConnect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'parent', parentKind: 'donor' }),
    );
    const [connection] = onConnect.mock.calls[0] ?? [];
    expect(
      describeConnection(
        connection,
        intl,
        family,
        (id) => (id === 'julie' ? 'Julie' : 'Rob'),
        PARENT_KIND_LABELS,
      ),
    ).toBe('“Julie” is a parent of “Rob” (Egg or sperm donor)');
  });

  it('announces a connection in the names people have once it is made', () => {
    const family = readFamily(
      [person('julie', { name: 'Julie' }), person('rob', { name: 'Rob' })],
      [],
      config,
    );
    const names = new Map([
      ['julie', 'Paternal grandmother'],
      ['rob', 'Father'],
    ]);
    expect(
      describeConnection(
        {
          kind: 'parent',
          parentId: 'julie',
          childId: 'rob',
          parentKind: 'biological',
          carriedPregnancy: true,
        },
        intl,
        family,
        (id) => names.get(id) ?? '',
        PARENT_KIND_LABELS,
      ),
    ).toBe(
      '“Paternal grandmother” is a parent of “Father” (Genetic parent (carried the pregnancy))',
    );
    expect(
      describeConnection(
        { kind: 'partner', firstId: 'julie', secondId: 'rob', current: false },
        intl,
        family,
        (id) => names.get(id) ?? '',
        PARENT_KIND_LABELS,
      ),
    ).toBe('“Paternal grandmother” and “Father” were partners');
  });

  it('says why someone cannot be connected as the parent of their own ancestor', async () => {
    const family = readFamily(
      [
        person('ego', { isEgo: true }),
        person('shannon', { name: 'Shannon' }),
        person('grandpa', { name: 'Grandpa' }),
      ],
      [
        link('shannon', 'ego', 'biological'),
        link('grandpa', 'shannon', 'biological'),
      ],
      config,
    );
    const anchor = document.createElement('button');
    document.body.append(anchor);
    render(
      <TestProtocolLocalization>
        <ConnectMenu
          pair={{ firstId: 'ego', secondId: 'grandpa' }}
          family={family}
          displayName={(id) => (id === 'ego' ? 'You' : 'Grandpa')}
          parentKindLabels={PARENT_KIND_LABELS}
          sexLabels={SEX_LABELS}
          anchor={anchor}
          onConnect={() => undefined}
          onClose={() => undefined}
        />
      </TestProtocolLocalization>,
    );
    const item = await screen.findByTestId('pedigree-connect-parent-ego');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription(
      /“Grandpa”.*one of your ancestors/,
    );
  });

  it('says why two people already connected cannot be partners', async () => {
    const family = readFamily(
      [person('ego', { isEgo: true }), person('shannon', { name: 'Shannon' })],
      [link('shannon', 'ego', 'biological')],
      config,
    );
    const anchor = document.createElement('button');
    document.body.append(anchor);
    render(
      <TestProtocolLocalization>
        <ConnectMenu
          pair={{ firstId: 'ego', secondId: 'shannon' }}
          family={family}
          displayName={(id) => (id === 'ego' ? 'You' : 'Shannon')}
          parentKindLabels={PARENT_KIND_LABELS}
          sexLabels={SEX_LABELS}
          anchor={anchor}
          onConnect={() => undefined}
          onClose={() => undefined}
        />
      </TestProtocolLocalization>,
    );
    const partners = await screen.findByTestId('pedigree-connect-partners');
    expect(partners).toHaveAttribute('aria-disabled', 'true');
    expect(partners).toHaveAccessibleDescription(
      /You and “Shannon” are already connected/,
    );
  });

  // Ruling 21: a choice that would record a second carrier is unavailable,
  // with a reason naming who carried the child.
  it('says who carried the child under each choice that would record a second carrier', async () => {
    const family = readFamily(
      [
        person('ego', { isEgo: true }),
        person('mum', { name: 'Mum' }),
        person('amy', { name: 'Amy' }),
      ],
      [link('mum', 'ego', 'biological', { carrier: true })],
      config,
    );
    const anchor = document.createElement('button');
    document.body.append(anchor);
    render(
      <TestProtocolLocalization>
        <ConnectMenu
          pair={{ firstId: 'amy', secondId: 'ego' }}
          family={family}
          displayName={(id) =>
            id === 'ego' ? 'You' : id === 'mum' ? 'Mum' : 'Amy'
          }
          parentKindLabels={PARENT_KIND_LABELS}
          sexLabels={SEX_LABELS}
          anchor={anchor}
          onConnect={() => undefined}
          onClose={() => undefined}
        />
      </TestProtocolLocalization>,
    );
    await userEvent.click(
      await screen.findByTestId('pedigree-connect-parent-amy'),
    );
    for (const id of [
      'biological-carrier',
      'adoptive-carrier',
      'social-carrier',
      'donor-carrier',
      'surrogate',
    ]) {
      const item = await screen.findByTestId(`pedigree-connect-kind-${id}`);
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveAccessibleDescription(
        '“Mum” is recorded as having carried you, and only one person carries a pregnancy.',
      );
    }
    expect(
      screen.getByTestId('pedigree-connect-kind-adoptive-carrier'),
    ).toHaveTextContent('Adoptive parent (carried the pregnancy)');
    expect(
      screen.getByTestId('pedigree-connect-kind-adoptive'),
    ).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the reason under every choice it makes unavailable', async () => {
    const family = readFamily(
      [
        person('ego', { isEgo: true }),
        person('huda', { name: 'Huda', sex: ['female'] }),
        person('zainab', { name: 'Zainab', sex: ['female'] }),
      ],
      [link('huda', 'ego', 'biological', { carrier: true })],
      config,
    );
    const anchor = document.createElement('button');
    document.body.append(anchor);
    render(
      <TestProtocolLocalization>
        <ConnectMenu
          pair={{ firstId: 'zainab', secondId: 'ego' }}
          family={family}
          displayName={(id) =>
            id === 'ego' ? 'You' : id === 'huda' ? 'Huda' : 'Zainab'
          }
          parentKindLabels={PARENT_KIND_LABELS}
          sexLabels={SEX_LABELS}
          anchor={anchor}
          onConnect={() => undefined}
          onClose={() => undefined}
        />
      </TestProtocolLocalization>,
    );
    await userEvent.click(
      await screen.findByTestId('pedigree-connect-parent-zainab'),
    );
    const reason =
      '“Huda” is recorded as having carried you, and only one person carries a pregnancy.';
    for (const id of ['adoptive-carrier', 'social-carrier', 'surrogate']) {
      const item = await screen.findByTestId(`pedigree-connect-kind-${id}`);
      expect(item).toHaveTextContent(reason);
      expect(item).toHaveAccessibleDescription(reason);
    }
  });

  it('offers the genetic kinds unavailable, saying why, once two genetic parents are recorded', async () => {
    const family = readFamily(
      [
        person('ego', { isEgo: true, sex: ['male'] }),
        person('debra', { name: 'Debra', sex: ['female'] }),
        person('steve', { name: 'Steve', sex: ['male'] }),
        person('doris', { name: 'Doris', sex: ['female'] }),
      ],
      [
        link('debra', 'ego', 'biological', { carrier: true }),
        link('steve', 'ego', 'biological'),
        link('debra', 'steve', 'partner'),
        link('doris', 'steve', 'biological'),
      ],
      config,
    );
    const names: Record<string, string> = {
      ego: 'You',
      debra: 'Debra',
      steve: 'Steve',
      doris: 'Doris',
    };
    const anchor = document.createElement('button');
    document.body.append(anchor);
    render(
      <TestProtocolLocalization>
        <ConnectMenu
          pair={{ firstId: 'doris', secondId: 'ego' }}
          family={family}
          displayName={(id) => names[id] ?? id}
          parentKindLabels={PARENT_KIND_LABELS}
          sexLabels={SEX_LABELS}
          anchor={anchor}
          onConnect={() => undefined}
          onClose={() => undefined}
        />
      </TestProtocolLocalization>,
    );
    await userEvent.click(
      await screen.findByTestId('pedigree-connect-parent-doris'),
    );
    for (const id of ['biological', 'donor']) {
      const item = await screen.findByTestId(`pedigree-connect-kind-${id}`);
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveTextContent(/two genetic parents/);
      expect(item).toHaveAccessibleDescription(/“Debra” and “Steve”/);
    }
    expect(
      screen.getByTestId('pedigree-connect-kind-adoptive'),
    ).not.toHaveAttribute('aria-disabled', 'true');
  });
});
