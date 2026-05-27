import type { SVGProps } from 'react';

import { Container } from '~/components/ui/Container';
import { Logo } from '~/components/ui/Logo';
import { externalLinks, footerLinks } from '~/lib/content';

const iconProps: SVGProps<SVGSVGElement> = {
  'viewBox': '0 0 24 24',
  'fill': 'currentColor',
  'aria-hidden': true,
};

const YoutubeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...p}>
    <path d="M23.5 6.5a3 3 0 0 0-2.1-2.1C19.5 3.9 12 3.9 12 3.9s-7.5 0-9.4.5A3 3 0 0 0 .5 6.5 31.2 31.2 0 0 0 0 12a31.2 31.2 0 0 0 .5 5.5 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.2 31.2 0 0 0 24 12a31.2 31.2 0 0 0-.5-5.5zM9.6 15.6V8.4l6.2 3.6z" />
  </svg>
);

const TwitterIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...p}>
    <path d="M23 4.9c-.8.4-1.7.6-2.6.8a4.5 4.5 0 0 0 2-2.5c-.9.5-1.9.9-2.9 1.1a4.5 4.5 0 0 0-7.7 4.1A12.8 12.8 0 0 1 2.5 3.7a4.5 4.5 0 0 0 1.4 6 4.4 4.4 0 0 1-2-.6v.1a4.5 4.5 0 0 0 3.6 4.4 4.5 4.5 0 0 1-2 .1 4.5 4.5 0 0 0 4.2 3.1A9 9 0 0 1 1 18.6a12.7 12.7 0 0 0 6.9 2c8.3 0 12.8-6.9 12.8-12.8v-.6c.9-.6 1.6-1.4 2.3-2.3z" />
  </svg>
);

const GithubIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...iconProps} {...p}>
    <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
  </svg>
);

const socials = [
  { label: 'YouTube', href: externalLinks.youtube, Icon: YoutubeIcon },
  { label: 'Twitter', href: externalLinks.twitter, Icon: TwitterIcon },
  { label: 'GitHub', href: externalLinks.github, Icon: GithubIcon },
];

export function Footer() {
  return (
    <footer className="pt-12 pb-16">
      <Container>
        <div className="flex justify-center pb-10">
          <Logo />
        </div>
        <div className="border-outline/60 border-t pt-8">
          <div className="tablet-landscape:flex-row tablet-landscape:justify-between tablet-landscape:text-left flex flex-col items-center gap-6 text-center">
            <div className="flex gap-8">
              {footerLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link hover:text-cyber-grape text-base transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
            <p className="text-text/70 text-base">
              Copyright Complex Data Collective 2016-2026
            </p>
            <div className="flex gap-5">
              {socials.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="text-cyber-grape hover:text-neon-coral transition-colors"
                >
                  <Icon className="size-5" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </footer>
  );
}
