import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NewsTicker } from '../../sections/NewsTicker';
import { SectionHeading } from '../SectionHeading';

const componentRoot = resolve(process.cwd(), 'components');

const migrations = [
  ['ui/SectionHeading.tsx', ['h2']],
  ['layout/Footer.tsx', ['p']],
  ['layout/ProjectsMenu.tsx', ['h3']],
  ['sections/Contractors.tsx', ['h3', 'p']],
  ['sections/Hero.tsx', ['p']],
  ['sections/WhatNext.tsx', ['h2', 'h3', 'p']],
  ['sections/CoreTeam.tsx', ['p']],
  ['sections/Publications.tsx', ['h3', 'p']],
  ['sections/DesignPrinciples.tsx', ['h2', 'h3', 'p']],
  ['sections/NewsTicker.tsx', ['p']],
  ['sections/Tools.tsx', ['h3', 'p']],
  ['sections/Institutions.tsx', ['p']],
] as const;

describe('homepage typography', () => {
  it('renders the shared section title as a level-two Fresco heading', () => {
    render(<SectionHeading title="Section title" />);

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Section title',
    });

    expect(heading.tagName).toBe('H2');
    expect(heading).toHaveClass('scroll-m-20', 'text-pretty');
  });

  it.each(migrations)(
    '%s replaces its static native typography tags',
    (relativePath, nativeTags) => {
      const source = readFileSync(resolve(componentRoot, relativePath), 'utf8');

      for (const nativeTag of nativeTags) {
        expect(source).not.toMatch(new RegExp(`<${nativeTag}(?:\\s|>)`));
      }
    },
  );

  it('adopts Fresco typography for the animated hero and project copy', () => {
    const heroSource = readFileSync(
      resolve(componentRoot, 'sections/Hero.tsx'),
      'utf8',
    );
    const projectsMenuSource = readFileSync(
      resolve(componentRoot, 'layout/ProjectsMenu.tsx'),
      'utf8',
    );

    expect(heroSource).toContain('motion.create(Heading)');
    expect(heroSource).not.toContain('<motion.h1');
    expect(projectsMenuSource).toContain('motion.create(Paragraph)');
    expect(projectsMenuSource).not.toContain('<motion.p');
  });

  it('renders the latest-news label with Fresco Pill semantics', () => {
    const newsTickerSource = readFileSync(
      resolve(componentRoot, 'sections/NewsTicker.tsx'),
      'utf8',
    );

    expect(newsTickerSource).toContain(
      "import Pill from '@codaco/fresco-ui/Pill'",
    );
    expect(newsTickerSource).not.toContain('const Badge');

    render(<NewsTicker />);

    for (const label of screen.getAllByText('Latest News:')) {
      expect(label.tagName).toBe('SPAN');
      expect(label).toHaveClass('rounded-full', 'border', 'p-0');
    }
  });
});
