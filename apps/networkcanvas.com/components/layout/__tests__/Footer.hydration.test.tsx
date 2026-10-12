import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import messages from '../../../messages/en.json';

// The build year is read at module scope, so it has to be set before the
// component is imported.
const BUILD_YEAR = '2026';
process.env.NEXT_PUBLIC_BUILD_YEAR = BUILD_YEAR;

// The footer's other regions are not what this test is about; the shared footer
// is stubbed down to the one prop under test so the assertion reads the
// copyright text directly.
vi.mock('@codaco/fresco-ui/navigation/SiteFooter', () => ({
  default: ({ copyright }: { copyright: ReactNode }) => <div>{copyright}</div>,
}));

vi.mock('~/components/layout/SiteLocaleSwitcher', () => ({
  SiteLocaleSwitcher: () => <span>locale</span>,
}));

vi.mock('~/components/ui/Logo', () => ({
  Logo: () => <span>logo</span>,
}));

const { Footer } = await import('../Footer');

function renderFooter() {
  return render(
    <NextIntlClientProvider locale="en-US" messages={messages}>
      <Footer />
    </NextIntlClientProvider>,
  );
}

describe('Footer copyright year', () => {
  // networkcanvas.com is `output: 'export'`: the HTML is produced once, at build
  // time, and hydrated later on a visitor's machine. A year read from the clock
  // during render therefore differs between the two whenever the visitor's year
  // is not the build's, which React reports as the #418 hydration error. Moving
  // the clock is how this test tells "baked at build time" from "read at render".
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2031-03-01T12:00:00Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  afterEach(cleanup);

  it('renders the build year, not the year the page is viewed in', () => {
    renderFooter();

    expect(
      screen.getByText(`Copyright Complex Data Collective 2016-${BUILD_YEAR}`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/2031/)).not.toBeInTheDocument();
  });

  it('renders identically however far the clock moves', () => {
    const { container } = renderFooter();
    const atBuildTime = container.innerHTML;
    cleanup();

    vi.setSystemTime(new Date('2042-12-31T23:59:59Z'));
    const { container: later } = renderFooter();

    expect(later.innerHTML).toBe(atBuildTime);
  });
});
