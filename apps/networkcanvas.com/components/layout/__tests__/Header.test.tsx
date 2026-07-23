import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '~/test/renderWithIntl';

import { Footer } from '../Footer';
import { Header } from '../Header';
import ThemeSwitcher from '../ThemeSwitcher';

vi.mock('~/lib/i18n/navigation', () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  } & Omit<ComponentProps<'a'>, 'href'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

describe('localized layout navigation', () => {
  afterEach(cleanup);

  it('renders Spanish navigation and menu controls', () => {
    renderWithIntl(<Header activeItemId="getStarted" />, 'es');

    expect(
      screen.getByRole('link', { name: 'Inicio de Network Canvas' }),
    ).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Comunidad' })).toHaveAttribute(
      'href',
      'https://community.networkcanvas.com/',
    );
    expect(
      screen.getByRole('link', { name: 'Galería de protocolos' }),
    ).toHaveAttribute('href', 'https://protocolgallery.networkcanvas.com/');
    expect(
      screen.getByRole('button', { name: 'Software' }),
    ).toBeInTheDocument();
    const getStartedLinks = screen.getAllByRole('link', { name: 'Comenzar' });
    for (const link of getStartedLinks) {
      expect(link).toHaveAttribute('href', '/get-started');
      expect(link).toHaveAttribute('aria-current', 'page');
    }
    expect(
      screen.queryByRole('combobox', { name: 'Idioma' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Abrir navegación del sitio' }),
    );
    expect(
      screen.getByRole('button', { name: 'Cerrar navegación del sitio' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('marks animated navigation for its pre-hydration entrance state', () => {
    const { container } = renderWithIntl(
      <Header entranceVariants={{ hidden: {}, visible: {} }} />,
    );

    expect(container.querySelector('header')).toHaveClass(
      'entrance-motion-item',
    );
  });

  it('uses a large, heavier-stroked desktop theme control', () => {
    renderWithIntl(<ThemeSwitcher view="desktop" />);

    const trigger = screen.getByRole('button', {
      name: 'Color theme: System',
    });
    expect(trigger).toHaveClass('h-16');
    expect(trigger).toHaveClass('[&>.lucide]:[stroke-width:3.5]');
    expect(trigger.querySelector('.lucide-sun-moon')).toBeInTheDocument();
  });

  it('uses theme icons instead of checkmarks in the theme menu', () => {
    renderWithIntl(<ThemeSwitcher view="desktop" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Color theme: System' }),
    );

    const lightOption = screen.getByRole('menuitemradio', { name: 'Light' });
    const darkOption = screen.getByRole('menuitemradio', { name: 'Dark' });
    const systemOption = screen.getByRole('menuitemradio', { name: 'System' });

    expect(lightOption.querySelector('.lucide-sun')).toBeInTheDocument();
    expect(darkOption.querySelector('.lucide-moon')).toBeInTheDocument();
    expect(systemOption.querySelector('.lucide-sun-moon')).toBeInTheDocument();
    expect(document.querySelector('.lucide-check')).not.toBeInTheDocument();
  });

  it('renders translated footer links and language selection', () => {
    renderWithIntl(<Footer />, 'es');

    expect(
      screen.queryByRole('link', { name: 'Términos de uso' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Política de privacidad' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Derechos de autor de Complex Data Collective/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Idioma' }),
    ).toBeInTheDocument();
  });
});
