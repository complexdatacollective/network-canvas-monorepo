// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ecosystemLocales, pseudoAppLocales } from '../locales.ts';
import {
  createAppIntl,
  FIRST_STRONG_ISOLATE as FSI,
  POP_DIRECTIONAL_ISOLATE as PDI,
} from '../messages.ts';
import { createPseudoIntl } from '../pseudo.ts';
import {
  AppDirectionOverride,
  AppI18nProvider,
  AppMessage,
  useAppIntl,
} from '../react.tsx';

const JOINED = {
  id: 'demo.joined',
  defaultMessage: 'You joined {teamName} as {role}',
  description: 'Test message with two text values.',
};

const JOINED_AR = 'انضممت إلى {teamName} بصفة {role}';

const isolated = (value: string) => `${FSI}${value}${PDI}`;

describe('bidi isolation of interpolated values', () => {
  it('isolates every text value in an Arabic message', () => {
    const intl = createAppIntl({
      locale: 'ar',
      messages: { [JOINED.id]: JOINED_AR },
    });
    expect(
      intl.formatMessage(JOINED, { teamName: 'team-b!', role: 'Group (B).' }),
    ).toBe(`انضممت إلى ${isolated('team-b!')} بصفة ${isolated('Group (B).')}`);
  });

  it('isolates values in a message Arabic falls back to English for', () => {
    // A sparse catalog leaves this message to its English default, but the
    // sentence is still shown inside a right-to-left interface.
    const intl = createAppIntl({ locale: 'ar', messages: {} });
    expect(
      intl.formatMessage(JOINED, { teamName: 'Wave 2', role: 'admin' }),
    ).toBe(`You joined ${isolated('Wave 2')} as ${isolated('admin')}`);
  });

  it('leaves English output byte for byte unchanged', () => {
    const intl = createAppIntl({ locale: 'en' });
    expect(
      intl.formatMessage(JOINED, { teamName: 'team-b!', role: 'Group (B).' }),
    ).toBe('You joined team-b! as Group (B).');
  });

  it('isolates a right-to-left value in an English sentence', () => {
    const intl = createAppIntl({ locale: 'en' });
    expect(
      intl.formatMessage(JOINED, { teamName: 'فريق ٢', role: 'admin' }),
    ).toBe(`You joined ${isolated('فريق ٢')} as admin`);
  });

  it('chooses a select arm by the value itself, and isolates where it is shown', () => {
    const intl = createAppIntl({ locale: 'ar' });
    const message = {
      id: 'demo.role',
      defaultMessage:
        '{role, select, admin {مشرف} other {عضو}}: {role} — {name}',
      description: 'Test message using one value as a select and as text.',
    };
    expect(intl.formatMessage(message, { role: 'admin', name: 'Ann!' })).toBe(
      `مشرف: ${isolated('admin')} — ${isolated('Ann!')}`,
    );
  });

  it('isolates text inside plural arms but never numbers', () => {
    const intl = createAppIntl({ locale: 'ar' });
    const message = {
      id: 'demo.moved',
      defaultMessage:
        '{total, plural, one {نقل {name}} other {نقل {name} إلى {position} من {total, number}}}',
      description: 'Test message with text and numbers inside plural arms.',
    };
    const formatted = intl.formatMessage(message, {
      name: 'Wave 2',
      position: 3,
      total: 5,
    });
    expect(formatted).toBe(
      `نقل ${isolated('Wave 2')} إلى 3 من ${new Intl.NumberFormat('ar').format(5)}`,
    );
  });

  it('carries the isolates into rich-text chunks', () => {
    const intl = createAppIntl({ locale: 'ar' });
    const message = {
      id: 'demo.rich',
      defaultMessage: 'مرحبا <b>{name}</b>',
      description: 'Test message with a value inside a tag.',
    };
    const chunksSeen: unknown[][] = [];
    intl.formatMessage(message, {
      name: 'team-b!',
      b: (chunks: string[]) => {
        chunksSeen.push(chunks);
        return `[${chunks.join('')}]`;
      },
    });
    expect(chunksSeen.flat().join('')).toBe(isolated('team-b!'));
  });

  it('isolates values under the right-to-left pseudo-locale', () => {
    const intl = createPseudoIntl({ locale: 'ar-XB' });
    const formatted = intl.formatMessage(JOINED, {
      teamName: 'team-b!',
      role: 'admin',
    });
    expect(formatted).toContain(isolated('team-b!'));
    expect(formatted).toContain(isolated('admin'));
  });

  it('isolates by the direction the provider shows the language in', () => {
    function Joined() {
      const intl = useAppIntl();
      return (
        <p>
          {intl.formatMessage(JOINED, { teamName: 'team-b!', role: 'admin' })}
        </p>
      );
    }
    const tree = (children: ReactNode) => (
      <AppI18nProvider
        locale="en"
        locales={[...ecosystemLocales, ...pseudoAppLocales]}
        manageDocument={false}
      >
        {children}
      </AppI18nProvider>
    );

    const { container, rerender } = render(tree(<Joined />));
    expect(screen.getByText(/You joined/).textContent).toBe(
      'You joined team-b! as admin',
    );

    rerender(
      <AppDirectionOverride direction="rtl">
        {tree(
          <AppMessage
            message={JOINED}
            values={{ teamName: 'team-b!', role: 'admin' }}
          />,
        )}
      </AppDirectionOverride>,
    );
    expect(container.textContent).toBe(
      `You joined ${isolated('team-b!')} as ${isolated('admin')}`,
    );
  });
});
