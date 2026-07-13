import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import SiteFooter from '../SiteFooter';

const links = [
  {
    label: 'Terms of Use',
    href: 'https://example.com/terms',
  },
  {
    label: 'Privacy Policy',
    href: 'https://example.com/privacy',
  },
] as const;

const socialLinks = [
  {
    platform: 'youtube',
    label: 'YouTube',
    href: 'https://youtube.com/example',
  },
  {
    platform: 'twitter',
    label: 'Twitter',
    href: 'https://twitter.com/example',
  },
  {
    platform: 'github',
    label: 'GitHub',
    href: 'https://github.com/example',
  },
] as const;

const baseProps = {
  brand: <span>Network Canvas</span>,
  links,
  copyright: 'Copyright Complex Data Collective 2016-2026',
  socialLinks,
};

describe('SiteFooter', () => {
  it('remains a server component and renders to static markup', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/navigation/SiteFooter.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/^\s*(['"])use client\1;?/m);

    const markup = renderToStaticMarkup(<SiteFooter {...baseProps} />);

    expect(markup).toContain('<footer');
    expect(markup).toContain('Network Canvas');
    expect(markup).toContain('Copyright Complex Data Collective 2016-2026');
  });

  it('renders labelled external links and the optional extra content', () => {
    render(
      <SiteFooter
        {...baseProps}
        extraContent={<button type="button">Select language</button>}
      />,
    );

    for (const { label, href } of links) {
      const link = screen.getByRole('link', { name: label });

      expect(link).toMatchObject({
        href,
        target: '_blank',
        rel: 'noreferrer',
      });
      expect(link).toHaveClass(
        'group',
        'text-link',
        'focusable',
        'font-semibold',
        'text-base',
      );
      expect(link.querySelector('span')).toHaveClass(
        'group-hover:bg-[length:100%_2px]',
        'group-focus-visible:bg-[length:100%_2px]',
      );
    }

    expect(
      screen.getByRole('button', { name: 'Select language' }),
    ).toBeInTheDocument();
  });

  it('owns accessible icons for each supported social platform', () => {
    render(<SiteFooter {...baseProps} />);

    for (const { label, href } of socialLinks) {
      const link = screen.getByRole('link', { name: label });
      const icon = link.querySelector('svg');

      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
      expect(link).not.toHaveClass('group');
      expect(link.querySelector('span')).not.toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveClass('size-5');
    }

    expect(
      within(screen.getByRole('contentinfo')).getAllByRole('link'),
    ).toHaveLength(links.length + socialLinks.length);
  });

  it('merges footer and container styling hooks', () => {
    const { container } = render(
      <SiteFooter
        {...baseProps}
        className="bg-primary"
        containerClassName="max-w-xl"
      />,
    );

    expect(container.querySelector('footer')).toHaveClass(
      '@container',
      'bg-primary',
    );
    expect(container.querySelector('.max-w-xl')).toHaveClass('max-w-xl');
    expect(container.querySelector('.max-w-xl')).not.toHaveClass(
      'max-w-[75rem]',
    );
  });
});
