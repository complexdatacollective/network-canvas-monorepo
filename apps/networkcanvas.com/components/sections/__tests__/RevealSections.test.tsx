import { cleanup, screen } from '@testing-library/react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TeamMember } from '~/lib/siteContent';
import { renderWithIntl } from '~/test/renderWithIntl';

import { CoreTeam } from '../CoreTeam';
import { DesignPrinciples } from '../DesignPrinciples';
import { Tools } from '../Tools';
import { WhatNext } from '../WhatNext';

const multiChildKeySets = vi.hoisted<
  Array<Array<string | number | bigint | null>>
>(() => []);

vi.mock('~/components/ui/Reveal', async () => {
  const React = await import('react');

  return {
    Reveal: ({
      children,
      className,
      delay: _delay,
      direction: _direction,
      distance: _distance,
      duration: _duration,
      easing: _easing,
      scrollLinked: _scrollLinked,
      scrollStagger: _scrollStagger,
      ...props
    }: ComponentPropsWithoutRef<'div'> & {
      children: ReactNode;
      delay?: number;
      direction?: string;
      distance?: number;
      duration?: number;
      easing?: readonly number[];
      scrollLinked?: boolean;
      scrollStagger?: number;
    }) => {
      const keys: Array<string | number | bigint | null> = [];
      React.Children.forEach(children, (child) => {
        keys.push(React.isValidElement(child) ? child.key : null);
      });
      if (keys.length > 1) multiChildKeySets.push(keys);

      return React.createElement('div', { ...props, className }, children);
    },
  };
});

vi.mock('../ScientificAdvisors', () => ({
  ScientificAdvisors: () => null,
}));

const members: TeamMember[] = [
  {
    id: 'researcher',
    name: 'Example Researcher',
    institution: 'Example University',
    photo: '/images/team/example.png',
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  multiChildKeySets.length = 0;
});

describe('sections using Reveal', () => {
  it('keys sibling content before it crosses into the client Reveal', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    renderWithIntl(
      <>
        <DesignPrinciples />
        <Tools />
        <CoreTeam members={members} />
        <WhatNext />
      </>,
    );

    expect(
      screen.getByRole('heading', { name: 'Ontological flexibility' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Example Researcher')).toBeInTheDocument();
    expect(multiChildKeySets.length).toBeGreaterThan(0);
    expect(
      multiChildKeySets.every((keys) => keys.every((key) => key !== null)),
    ).toBe(true);
    expect(
      consoleError.mock.calls.some((arguments_) =>
        arguments_.some((argument) =>
          String(argument).includes('unique "key" prop'),
        ),
      ),
    ).toBe(false);
  });
});
