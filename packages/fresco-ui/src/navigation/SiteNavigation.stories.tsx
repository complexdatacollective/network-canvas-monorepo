import type { Meta, StoryObj } from '@storybook/react-vite';
import { Monitor, Search } from 'lucide-react';

import Button from '../Button';
import SiteNavigation from './SiteNavigation';
import type { SiteNavigationLocale } from './SiteNavigation';

type StoryArgs = {
  activeItemId: 'home' | 'documentation' | 'getStarted';
  containerWidth: number;
  locale: SiteNavigationLocale;
  showMobileAccessory: boolean;
  showUtility: boolean;
  site: 'documentation' | 'website';
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
  not configurable.
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
      options: ['home', 'documentation', 'getStarted'],
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
      options: ['website', 'documentation'],
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
      style={{ width: `min(100%, ${containerWidth}px)`, marginInline: 'auto' }}
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
