import type { CSSProperties, ReactNode, SVGProps } from 'react';

import { NativeLink } from '../NativeLink';
import Paragraph from '../typography/Paragraph';
import { cx } from '../utils/cva';

export type SiteFooterLink = {
  label: string;
  href: string;
  target?: '_blank' | '_self' | '_parent' | '_top';
  rel?: string;
};

export type SiteFooterSocialPlatform = 'youtube' | 'twitter' | 'github';

export type SiteFooterSocialLink = {
  platform: SiteFooterSocialPlatform;
  label: string;
  href: string;
};

export type SiteFooterProps = {
  brand: ReactNode;
  links: readonly SiteFooterLink[];
  copyright: ReactNode;
  socialLinks: readonly SiteFooterSocialLink[];
  extraContent?: ReactNode;
  className?: string;
  containerClassName?: string;
  style?: CSSProperties;
};

const iconProps: SVGProps<SVGSVGElement> = {
  'viewBox': '0 0 24 24',
  'fill': 'currentColor',
  'aria-hidden': true,
  'focusable': 'false',
};

const YoutubeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M23.5 6.5a3 3 0 0 0-2.1-2.1C19.5 3.9 12 3.9 12 3.9s-7.5 0-9.4.5A3 3 0 0 0 .5 6.5 31.2 31.2 0 0 0 0 12a31.2 31.2 0 0 0 .5 5.5 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.2 31.2 0 0 0 24 12a31.2 31.2 0 0 0-.5-5.5zM9.6 15.6V8.4l6.2 3.6z" />
  </svg>
);

const TwitterIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M23 4.9c-.8.4-1.7.6-2.6.8a4.5 4.5 0 0 0 2-2.5c-.9.5-1.9.9-2.9 1.1a4.5 4.5 0 0 0-7.7 4.1A12.8 12.8 0 0 1 2.5 3.7a4.5 4.5 0 0 0 1.4 6 4.4 4.4 0 0 1-2-.6v.1a4.5 4.5 0 0 0 3.6 4.4 4.5 4.5 0 0 1-2 .1 4.5 4.5 0 0 0 4.2 3.1A9 9 0 0 1 1 18.6a12.7 12.7 0 0 0 6.9 2c8.3 0 12.8-6.9 12.8-12.8v-.6c.9-.6 1.6-1.4 2.3-2.3z" />
  </svg>
);

const GithubIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...props}>
    <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
  </svg>
);

const socialIcons: Record<
  SiteFooterSocialPlatform,
  (props: SVGProps<SVGSVGElement>) => ReactNode
> = {
  youtube: YoutubeIcon,
  twitter: TwitterIcon,
  github: GithubIcon,
};

export default function SiteFooter({
  brand,
  links,
  copyright,
  socialLinks,
  extraContent,
  className,
  containerClassName,
  style,
}: SiteFooterProps) {
  return (
    <footer className={cx('@container pt-12 pb-16', className)} style={style}>
      <div
        className={cx(
          'mx-auto w-full max-w-[75rem] px-6 @min-[64rem]:px-10',
          containerClassName,
        )}
      >
        <div className="flex justify-center pb-10">{brand}</div>
        <div className="border-outline/60 border-t pt-8">
          <div className="flex flex-col items-center gap-6 text-center @min-[64rem]:flex-row @min-[64rem]:justify-between @min-[64rem]:text-left">
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
              {links.map((link) => (
                <NativeLink
                  key={`${link.href}-${link.label}`}
                  href={link.href}
                  target={link.target ?? '_blank'}
                  rel={link.rel ?? 'noreferrer'}
                  className="text-base"
                >
                  {link.label}
                </NativeLink>
              ))}
            </div>
            <Paragraph margin="none" className="text-text/70 text-base">
              {copyright}
            </Paragraph>
            {extraContent}
            <div className="flex gap-5">
              {socialLinks.map(({ platform, label, href }) => {
                const Icon = socialIcons[platform];

                return (
                  <a
                    key={`${platform}-${href}`}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="focusable text-text hover:text-neon-coral rounded-sm transition-colors"
                  >
                    <Icon className="size-5" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
