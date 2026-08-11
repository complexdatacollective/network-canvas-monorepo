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
