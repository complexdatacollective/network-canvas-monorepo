import { NavigationMenu } from '@base-ui/react/navigation-menu';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronDown } from 'lucide-react';

import Button, { buttonVariants } from '../Button';
import Spinner from '../Spinner';
import { headingVariants } from '../typography/Heading';
import { cx } from '../utils/cva';
import SiteNavigation from './SiteNavigation';
import type {
  SiteNavigationItem,
  SiteNavigationLinkItem,
} from './SiteNavigation';

type ActiveItem =
  | 'home'
  | 'community'
  | 'documentation'
  | 'protocolGallery'
  | 'software'
  | 'getStarted';

type StoryArgs = {
  activeItemId: ActiveItem;
  containerWidth: number;
  longLabels: boolean;
  showInjectedItem: boolean;
};

type StoryLink = {
  id: string;
  label: string;
  href: string;
  active: boolean;
};

const themeBreakpointOptions = [320, 480, 768, 1024, 1280, 1536, 1920, 2560];

const themeBreakpointLabels: Record<string, string> = {
  320: 'Phone — 320px',
  480: 'Phone landscape — 480px',
  768: 'Tablet portrait — 768px',
  1024: 'Tablet landscape — 1024px',
  1280: 'Laptop — 1280px',
  1536: 'Desktop — 1536px',
  1920: 'Large desktop — 1920px',
  2560: 'Extra-large desktop — 2560px',
};

const navigationTextClasses = cx(
  headingVariants({ level: 'h4', variant: 'all-caps', margin: 'none' }),
  'focusable text-cyber-grape hover:text-neon-coral whitespace-nowrap transition-colors',
);

const COMPOSITION_DOC = `
A responsive, Base UI-backed site header that owns the brand, navigation
collection, phone menu, active-page state, and entrance animation boundary.
Consuming apps inject their router-aware link renderer and any custom items,
such as product menus or a language selector.

\`\`\`tsx
import SiteNavigation from '@codaco/fresco-ui/navigation/SiteNavigation';

<SiteNavigation
  activeItemId="documentation"
  brand={<Brand />}
  brandHref="/"
  brandLabel="Network Canvas home"
  closeMenuLabel="Close menu"
  openMenuLabel="Open menu"
  items={[
    { id: 'documentation', label: 'Docs', href: '/docs' },
    {
      id: 'language',
      render: ({ closeMenu, view }) => (
        <LanguageSelector
          onNavigate={view === 'mobile' ? closeMenu : undefined}
        />
      ),
    },
  ]}
  renderLink={(props) => <RouterLink {...props} />}
/>
\`\`\`

**Props**

- **\`items\`** — ordered link or custom-item definitions. Items support a
  breakpoint-aware \`className\` for app-owned responsive composition. Custom
  renderers receive \`active\`, \`closeMenu\`, and \`view\`
  (\`'desktop' | 'mobile'\`).
- **\`activeItemId\`** — matches an item ID and applies \`aria-current="page"\`.
- **Brand props** — \`brand\`, \`brandHref\`, \`brandLabel\`, and optional
  \`brandItemId\`.
- **\`renderLink\`** — adapts links to the consuming router without coupling
  this package to Next.js or React Router.
- **Layout and motion** — \`className\`, \`containerClassName\`, \`style\`, and
  optional \`entranceVariants\`.

The component uses container queries, so the width control below audits its
responsive behaviour independently of the Storybook viewport. Keyboard
navigation, focus management, and menu semantics come from Base UI.
`;

function StoryBrand() {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="shrink-0">
        <Spinner customSize="0.625rem" animationMode="hover" playOnMount />
      </span>
      <span className="font-heading text-cyber-grape hidden text-lg font-bold tracking-[0.18em] whitespace-nowrap @min-[56rem]:inline @min-[64rem]:hidden @min-[80rem]:inline">
        Network Canvas
      </span>
    </span>
  );
}

function StoryAction({ active }: { active: boolean }) {
  return (
    <a
      href="#get-started"
      aria-current={active ? 'page' : undefined}
      className={cx(
        buttonVariants({ color: 'primary' }),
        'rounded-full',
        headingVariants({
          level: 'h4',
          variant: 'all-caps',
          margin: 'none',
        }),
      )}
    >
      Get Started
    </a>
  );
}

function StoryLinkGroup({
  label,
  links,
  closeMenu,
}: {
  label: string;
  links: StoryLink[];
  closeMenu: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-cyber-grape/60 font-heading text-sm font-black tracking-widest uppercase">
        {label}
      </span>
      {links.map((link) => (
        <a
          key={link.id}
          href={link.href}
          aria-current={link.active ? 'page' : undefined}
          onClick={closeMenu}
          className={cx(navigationTextClasses, 'pl-3')}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

function StoryDropdown({
  active,
  label,
  links,
}: {
  active: boolean;
  label: string;
  links: StoryLink[];
}) {
  return (
    <NavigationMenu.Root render={<div />} className="relative">
      <NavigationMenu.List className="flex">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger
            aria-current={active ? 'page' : undefined}
            className={cx(
              navigationTextClasses,
              'data-[popup-open]:text-neon-coral group flex items-center gap-1',
            )}
          >
            {label}
            <ChevronDown
              aria-hidden
              className="size-4 transition-transform duration-200 group-data-[popup-open]:rotate-180"
            />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content>
            <ul className="flex min-w-56 flex-col gap-1 p-2">
              {links.map((link) => (
                <li key={link.id}>
                  <NavigationMenu.Link
                    active={link.active}
                    closeOnClick
                    href={link.href}
                    aria-current={link.active ? 'page' : undefined}
                    className={cx(
                      navigationTextClasses,
                      'hover:bg-platinum flex rounded-xl px-4 py-3',
                    )}
                  >
                    {link.label}
                  </NavigationMenu.Link>
                </li>
              ))}
            </ul>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <NavigationMenu.Portal>
        <NavigationMenu.Positioner
          sideOffset={14}
          align="center"
          collisionPadding={16}
          className="z-50 outline-none"
        >
          <NavigationMenu.Popup className="bg-surface rounded-[1.75rem] p-3 shadow-2xl ring-1 ring-black/5">
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

const meta: Meta<StoryArgs> = {
  title: 'Components/SiteNavigation',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: COMPOSITION_DOC } },
  },
  args: {
    activeItemId: 'home',
    containerWidth: 1280,
    longLabels: false,
    showInjectedItem: false,
  },
  argTypes: {
    activeItemId: {
      control: 'select',
      options: [
        'home',
        'community',
        'documentation',
        'protocolGallery',
        'software',
        'getStarted',
      ],
      description: 'Page or custom-item ID to mark as current.',
    },
    containerWidth: {
      options: themeBreakpointOptions,
      control: { type: 'select', labels: themeBreakpointLabels },
      description:
        'Width of the navigation container, using the shared theme breakpoints.',
    },
    longLabels: {
      control: 'boolean',
      description:
        'Use longer labels to check localisation and text expansion.',
    },
    showInjectedItem: {
      control: 'boolean',
      description:
        'Inject an app-owned locale selector through a custom navigation item.',
    },
  },
  render: ({ activeItemId, containerWidth, longLabels, showInjectedItem }) => {
    const resourceLinks: StoryLink[] = [
      {
        id: 'community',
        label: longLabels ? 'Research Community' : 'Community',
        href: '#community',
        active: activeItemId === 'community',
      },
      {
        id: 'documentation',
        label: longLabels ? 'Documentation' : 'Docs',
        href: '#documentation',
        active: activeItemId === 'documentation',
      },
      {
        id: 'protocolGallery',
        label: longLabels ? 'Interview Protocol Gallery' : 'Protocol Gallery',
        href: '#protocol-gallery',
        active: activeItemId === 'protocolGallery',
      },
    ];
    const softwareLinks: StoryLink[] = [
      {
        id: 'architect',
        label: 'Architect',
        href: '#architect',
        active: false,
      },
      {
        id: 'interviewer',
        label: 'Interviewer',
        href: '#interviewer',
        active: false,
      },
      { id: 'fresco', label: 'Fresco', href: '#fresco', active: false },
    ];
    const injectedItems: SiteNavigationItem[] = [];

    if (showInjectedItem) {
      injectedItems.push({
        id: 'language',
        render: ({ closeMenu, view }) => (
          <Button
            variant="outline"
            color="dynamic"
            aria-label="Select language"
            onClick={view === 'mobile' ? closeMenu : undefined}
          >
            <span aria-hidden>🇺🇸</span>
          </Button>
        ),
      });
    }

    const items: SiteNavigationItem[] = [
      ...resourceLinks.map<SiteNavigationLinkItem>((link) => ({
        id: link.id,
        label: link.label,
        href: link.href,
        className: 'hidden @min-[64rem]:block',
      })),
      {
        id: 'resources',
        className: '@min-[64rem]:hidden',
        render: ({ closeMenu, view }) =>
          view === 'desktop' ? (
            <StoryDropdown
              active={resourceLinks.some((link) => link.active)}
              label="Resources"
              links={resourceLinks}
            />
          ) : (
            <StoryLinkGroup
              label="Resources"
              links={resourceLinks}
              closeMenu={closeMenu}
            />
          ),
      },
      {
        id: 'software',
        render: ({ active, closeMenu, view }) =>
          view === 'desktop' ? (
            <StoryDropdown
              active={active}
              label="Software"
              links={softwareLinks}
            />
          ) : (
            <StoryLinkGroup
              label="Software"
              links={softwareLinks}
              closeMenu={closeMenu}
            />
          ),
      },
      ...injectedItems,
      {
        id: 'getStarted',
        render: ({ active }) => <StoryAction active={active} />,
      },
    ];

    return (
      <SiteNavigation
        activeItemId={activeItemId}
        brand={<StoryBrand />}
        brandHref="#home"
        brandLabel="Network Canvas home"
        closeMenuLabel="Close menu"
        items={items}
        openMenuLabel="Open menu"
        className="bg-background"
        style={{
          width: '100%',
          maxWidth: containerWidth,
          marginInline: 'auto',
        }}
      />
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

export const Phone: Story = { args: { containerWidth: 320 } };

export const PhoneLandscape: Story = { args: { containerWidth: 480 } };

export const TabletPortrait: Story = { args: { containerWidth: 768 } };

export const TabletLandscape: Story = { args: { containerWidth: 1024 } };

export const Laptop: Story = { args: { containerWidth: 1280 } };

export const Desktop: Story = { args: { containerWidth: 1536 } };

export const InjectedLocaleSelector: Story = {
  args: { containerWidth: 1280, showInjectedItem: true },
  parameters: {
    docs: {
      description: {
        story:
          'An app-owned locale selector injected through a custom item. The shared navigation controls placement and responsive composition without owning locale behaviour.',
      },
    },
  },
};

export const LocalisedLabels: Story = {
  args: { containerWidth: 1536, longLabels: true },
};
