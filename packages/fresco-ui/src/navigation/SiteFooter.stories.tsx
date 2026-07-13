import type { Meta, StoryObj } from '@storybook/react-vite';

import Button from '../Button';
import { cx } from '../utils/cva';
import SiteFooter from './SiteFooter';
import type { SiteFooterLink, SiteFooterSocialLink } from './SiteFooter';

type FooterWidth = 320 | 768 | 1024 | 1280;

type StoryArgs = {
  containerWidth: FooterWidth;
  longLabels: boolean;
  showExtraContent: boolean;
};

const widthClasses: Record<FooterWidth, string> = {
  320: 'max-w-[20rem]',
  768: 'max-w-[48rem]',
  1024: 'max-w-[64rem]',
  1280: 'max-w-[80rem]',
};

const socialLinks: readonly SiteFooterSocialLink[] = [
  {
    platform: 'youtube',
    label: 'YouTube',
    href: 'https://youtube.com/',
  },
  {
    platform: 'twitter',
    label: 'Twitter',
    href: 'https://twitter.com/',
  },
  {
    platform: 'github',
    label: 'GitHub',
    href: 'https://github.com/',
  },
];

const COMPOSITION_DOC = `
A server-compatible site footer that owns responsive structure, link semantics,
and the Network Canvas YouTube, Twitter, and GitHub icons. Consuming apps keep
their brand, translated copy, destinations, and optional app-specific controls.

\`\`\`tsx
import SiteFooter from '@codaco/fresco-ui/navigation/SiteFooter';

<SiteFooter
  brand={<Brand />}
  links={[
    { label: 'Terms of Use', href: termsUrl },
    { label: 'Privacy Policy', href: privacyUrl },
  ]}
  copyright={t('copyright', { year: new Date().getFullYear() })}
  socialLinks={[
    { platform: 'youtube', label: 'YouTube', href: youtubeUrl },
    { platform: 'twitter', label: 'Twitter', href: twitterUrl },
    { platform: 'github', label: 'GitHub', href: githubUrl },
  ]}
  extraContent={<LanguageSelector />}
/>
\`\`\`

**Props**

- **\`brand\`** — app-owned brand artwork or wordmark.
- **\`links\`** — labelled footer links. External links open in a new tab by
  default; each item can override \`target\` and \`rel\`. Text links use the
  shared animated underline treatment on hover and keyboard focus.
- **\`copyright\`** — complete, localisable copyright content.
- **\`socialLinks\`** — labelled YouTube, Twitter, and GitHub destinations. The
  shared footer supplies the decorative platform icons and their icon-specific
  hover treatment rather than the text-link underline.
- **\`extraContent\`** — optional app-owned content, such as a locale selector.
- **Styling hooks** — \`className\`, \`containerClassName\`, and \`style\`.

The component uses container queries, so it responds to the width it is given
rather than assuming anything about the consuming app's viewport.
`;

function StoryBrand() {
  return (
    <span className="font-heading text-text text-lg font-bold tracking-[0.18em]">
      Network Canvas
    </span>
  );
}

const meta: Meta<StoryArgs> = {
  title: 'Components/SiteFooter',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: { description: { component: COMPOSITION_DOC } },
  },
  args: {
    containerWidth: 1280,
    longLabels: false,
    showExtraContent: false,
  },
  argTypes: {
    containerWidth: {
      control: 'select',
      options: [320, 768, 1024, 1280],
      description: 'Width allocated to the footer in the consuming layout.',
    },
    longLabels: {
      control: 'boolean',
      description: 'Use expanded link and copyright copy to audit wrapping.',
    },
    showExtraContent: {
      control: 'boolean',
      description: 'Inject an app-owned control into the footer row.',
    },
  },
  render: ({ containerWidth, longLabels, showExtraContent }) => {
    const links: readonly SiteFooterLink[] = [
      {
        label: longLabels ? 'Terms and Conditions of Use' : 'Terms of Use',
        href: '#terms',
      },
      {
        label: longLabels
          ? 'Privacy and Personal Information Policy'
          : 'Privacy Policy',
        href: '#privacy',
      },
    ];

    return (
      <SiteFooter
        brand={<StoryBrand />}
        links={links}
        copyright={
          longLabels
            ? 'Copyright Complex Data Collective, from 2016 to the present year'
            : 'Copyright Complex Data Collective 2016-2026'
        }
        socialLinks={socialLinks}
        extraContent={
          showExtraContent ? (
            <Button variant="outline" color="dynamic" size="sm">
              en-US
            </Button>
          ) : undefined
        }
        className={cx('mx-auto', widthClasses[containerWidth])}
      />
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

export const Phone: Story = { args: { containerWidth: 320 } };

export const Tablet: Story = { args: { containerWidth: 768 } };

export const InjectedExtraContent: Story = {
  args: { showExtraContent: true },
  parameters: {
    docs: {
      description: {
        story:
          'The marketing site uses this slot for its locale selector; other consumers can omit it or supply their own app-specific control.',
      },
    },
  },
};

export const LocalisedLabels: Story = {
  args: { containerWidth: 1024, longLabels: true, showExtraContent: true },
};
