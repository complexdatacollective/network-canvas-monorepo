import type { Meta, StoryObj } from '@storybook/react-vite';
import { Monitor, Search } from 'lucide-react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import Button from '../Button';
import SiteNavigation from './SiteNavigation';
import type { SiteNavigationLocale } from './SiteNavigation';

type StoryArgs = {
  activeItemId:
    | 'home'
    | 'community'
    | 'documentation'
    | 'resources'
    | 'software'
    | 'getStarted';
  containerWidth: number;
  locale: SiteNavigationLocale;
  showMobileAccessory: boolean;
  showUtility: boolean;
  site: 'documentation' | 'external' | 'website';
};

const widths = [320, 480, 768, 1024, 1280, 1536];

const documentation = `
The canonical Network Canvas site header. Menu destinations, ordering,
responsive grouping, and translated copy are owned by this component so
consuming sites cannot drift.

\`\`\`tsx
import SiteNavigation from '@codaco/fresco-ui/navigation/SiteNavigation';

<SiteNavigation
  activeItemId="documentation"
  locale={resolvedSiteLocale}
  site="documentation"
  mobileAccessory={<DocumentationSearch />}
  renderUtility={({ view }) => <ThemeSwitcher view={view} />}
  renderLink={(props) => <RouterLink {...props} />}
/>
\`\`\`

- **\`locale\`** accepts the shared public-site locale union. The translation
  table is checked against that same union, so adding a supported locale also
  requires navigation copy at compile time.
- **\`site\`** selects routing context only; menu items and destinations are
  not configurable. \`external\` is for non-Network-Canvas hosts (e.g. the
  community forum): every destination renders as an absolute URL.
- **\`activeItemId\`** applies the current-page state to a canonical
  destination.
- **\`mobileAccessory\`** injects compact-only UI beside the menu trigger,
  such as documentation search and its tree-navigation control.
- **\`renderUtility\`** is the single sanctioned menu slot for app-owned UI,
  such as the documentation theme switcher.
- **\`renderLink\`** adapts canonical links to the consuming app's router.
- **\`skipToId\`** names the element the header's skip link jumps to
  (\`main-content\` by default, exported as \`SITE_NAVIGATION_SKIP_TARGET_ID\`
  from \`navigation/SiteNavigation.constants\`). The page owns that element:
  put the \`id\` on the element where its content starts, after the header.
- **Layout and motion** can be adapted with \`className\`,
  \`containerClassName\`, \`style\`, and \`entranceVariants\`.

The header uses its compact layout below the 64rem container breakpoint.
Base UI supplies desktop menu semantics, while the compact disclosure closes
with Escape and returns focus to its trigger.
`;

const meta = {
  title: 'Components/SiteNavigation',
  component: SiteNavigation,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: documentation,
      },
    },
  },
  argTypes: {
    activeItemId: {
      control: 'select',
      options: [
        'home',
        'community',
        'documentation',
        'resources',
        'software',
        'getStarted',
      ],
    },
    containerWidth: {
      control: 'select',
      options: widths,
    },
    locale: {
      control: 'select',
      options: ['en-US', 'en-GB', 'es'],
    },
    site: {
      control: 'radio',
      options: ['website', 'documentation', 'external'],
    },
  },
  args: {
    activeItemId: 'home',
    containerWidth: 1280,
    locale: 'en-US',
    showMobileAccessory: false,
    showUtility: false,
    site: 'website',
  },
  render: ({
    activeItemId,
    containerWidth,
    locale,
    showMobileAccessory,
    showUtility,
    site,
  }) => (
    <SiteNavigation
      activeItemId={activeItemId}
      locale={locale}
      site={site}
      className="bg-background text-text"
      style={{ width: `${containerWidth}px`, marginInline: 'auto' }}
      mobileAccessory={
        showMobileAccessory ? (
          <Button icon={<Search aria-hidden />} size="sm">
            Search docs
          </Button>
        ) : undefined
      }
      renderUtility={
        showUtility
          ? ({ view }) => (
              <Button icon={<Monitor aria-hidden />} size="sm" variant="text">
                {view === 'mobile' ? 'Theme: System' : undefined}
              </Button>
            )
          : undefined
      }
    />
  ),
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Website: Story = {};

export const Spanish: Story = {
  args: {
    locale: 'es',
  },
};

export const ExternalHost: Story = {
  args: {
    activeItemId: 'community',
    site: 'external',
  },
};

export const ResourcesGrouped: Story = {
  args: {
    activeItemId: 'documentation',
    containerWidth: 1152,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const resourcesButton = canvas.getByRole('button', { name: 'Resources' });

    await expect(resourcesButton).toBeVisible();
    await expect(resourcesButton).toHaveAttribute('aria-current', 'page');
    await expect(
      canvas.getByRole('link', { name: 'Documentation', hidden: true }),
    ).not.toBeVisible();
  },
};

export const ResourcesExpanded: Story = {
  args: {
    activeItemId: 'documentation',
    containerWidth: 1280,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const resourcesButton = canvas.getByRole('button', {
      name: 'Resources',
      hidden: true,
    });
    const documentationLink = canvas.getByRole('link', {
      name: 'Documentation',
    });

    await expect(resourcesButton).not.toBeVisible();
    await expect(documentationLink).toBeVisible();
    await expect(documentationLink).toHaveAttribute('aria-current', 'page');
  },
};

export const SoftwareExpanded: Story = {
  args: {
    activeItemId: 'software',
    containerWidth: 1536,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: 'Software' }));
    await waitFor(() => {
      const finalCard = screen
        .getByRole('link', { name: 'Interviewer Classic' })
        .closest('li');
      if (!finalCard) throw new Error('Expected the final software card.');

      expect(getComputedStyle(finalCard).opacity).toBe('1');
      expect(getComputedStyle(finalCard).transform).toBe('none');
    });
  },
};

export const SkipLink: Story = {
  args: {
    activeItemId: 'home',
    containerWidth: 1280,
  },
  parameters: {
    docs: {
      description: {
        story:
          'The header is repeated on every page, so its first focusable element is a skip link that jumps past it (WCAG 2.4.1). It is invisible until it takes focus. The page owns the destination: give the element where your content starts the `id` named by `skipToId` (`main-content` by default).',
      },
    },
  },
  render: ({ containerWidth, locale, site }) => (
    <div style={{ width: `${containerWidth}px`, marginInline: 'auto' }}>
      <SiteNavigation
        activeItemId="home"
        locale={locale}
        site={site}
        className="bg-background text-text"
      />
      <main id="main-content" className="px-6 py-10">
        <h1 className="font-heading text-2xl font-bold">Page content</h1>
        <p className="mt-4">
          Press Tab from the top of the page to reveal the skip link, then
          activate it to land here.
        </p>
        <a className="focusable text-link mt-4 inline-block" href="#example">
          First link in the content
        </a>
      </main>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const skipLink = canvas.getByRole('link', {
      name: 'Skip to main content',
    });
    const target = canvas.getByRole('main');

    await expect(skipLink).toHaveAttribute('href', '#main-content');
    // Clipped to a point while unfocused, so it takes up none of the header.
    await expect(skipLink.getBoundingClientRect().width).toBeLessThanOrEqual(2);

    // Unfocused, the link must cost the header no pixels. `sr-only` alone is
    // not proof of that — it is the wrapper that keeps the link out of flow —
    // so measure every box in the header with the link present and again with
    // it removed from layout entirely; any difference is a shift the header's
    // visual baselines would pick up.
    const header = canvas.getByRole('banner');
    const skipLinkHost = skipLink.parentElement;
    if (!skipLinkHost) throw new Error('Expected the skip link wrapper.');
    const measureHeader = () =>
      [header, ...header.querySelectorAll('*')]
        .filter((element) => !skipLinkHost.contains(element))
        .map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return [x, y, width, height].join(',');
        });
    const withSkipLink = measureHeader();
    skipLinkHost.hidden = true;
    const withoutSkipLink = measureHeader();
    skipLinkHost.hidden = false;
    await expect(withSkipLink).toEqual(withoutSkipLink);

    // Tab from a clean slate so "one Tab reaches it" means what it says.
    const focused = canvasElement.ownerDocument.activeElement;
    if (focused instanceof HTMLElement) focused.blur();
    await userEvent.tab();

    await expect(skipLink).toHaveFocus();
    // `not-sr-only` resets padding and white-space, so the visible treatment
    // has to be stated under the same `focus:` variant to survive it. Reading
    // the real box is what makes this fail if that ordering ever breaks.
    await waitFor(() => {
      expect(skipLink.getBoundingClientRect().width).toBeGreaterThan(100);
      expect(getComputedStyle(skipLink).paddingLeft).not.toBe('0px');
    });
    // Visible means on top: inside the viewport, and the element under its
    // centre is the link itself rather than header chrome painted over it.
    const focusedBox = skipLink.getBoundingClientRect();
    await expect(focusedBox.top).toBeGreaterThanOrEqual(0);
    await expect(focusedBox.left).toBeGreaterThanOrEqual(0);
    const hit = canvasElement.ownerDocument.elementFromPoint(
      focusedBox.left + focusedBox.width / 2,
      focusedBox.top + focusedBox.height / 2,
    );
    await expect(skipLink.contains(hit)).toBe(true);

    // The link really navigates, and letting the runner's page follow a
    // fragment tears the browser session down. Cancelling the default action
    // after React's handler has run leaves the part this story is about — the
    // link putting focus on the host page's target — intact.
    const cancelNavigation = (event: Event) => event.preventDefault();
    const { ownerDocument } = canvasElement;
    ownerDocument.addEventListener('click', cancelNavigation);
    try {
      await userEvent.click(skipLink);
      await expect(target).toHaveFocus();
      await expect(target).toHaveAttribute('tabindex', '-1');
    } finally {
      ownerDocument.removeEventListener('click', cancelNavigation);
    }
  },
};

export const DocumentationCompact: Story = {
  args: {
    activeItemId: 'documentation',
    containerWidth: 480,
    locale: 'en-US',
    showMobileAccessory: true,
    showUtility: true,
    site: 'documentation',
  },
};
