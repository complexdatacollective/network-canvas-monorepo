import type React from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';

const openExternalLink = (href: string) => {
  window.open(href, '_blank', 'noopener,noreferrer');
};

type ExternalLinkProps = {
  children: React.ReactNode;
  href: string;
  className?: string;
  /** Skip the prose-link treatment when another component supplies styling. */
  unstyled?: boolean;
};

const ExternalLink = ({
  children,
  className,
  href,
  unstyled = false,
}: ExternalLinkProps) => {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    openExternalLink(href);
  };

  if (unstyled) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={className}
      >
        {children}
      </a>
    );
  }

  return (
    <NativeLink
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={className}
    >
      {children}
    </NativeLink>
  );
};

export default ExternalLink;
