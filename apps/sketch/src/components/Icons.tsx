// Small stroke icons from the mockup. All decorative: pair them with text.

import type { ReactNode } from 'react';

type IconProps = { size?: number; className?: string };

const Stroke = ({
  size = 20,
  className,
  strokeWidth = 2.4,
  children,
}: IconProps & { strokeWidth?: number; children: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    className={className}
  >
    {children}
  </svg>
);

export const ArrowRightIcon = (props: IconProps) => (
  <Stroke strokeWidth={2.6} {...props}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Stroke>
);

export const ArrowUpRightIcon = (props: IconProps) => (
  <Stroke strokeWidth={2.4} {...props}>
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </Stroke>
);

export const DownloadIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 4v11" />
    <path d="m7 11 5 5 5-5" />
    <path d="M5 20h14" />
  </Stroke>
);

export const PlusIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Stroke>
);

export const CheckIcon = (props: IconProps) => (
  <Stroke strokeWidth={2.6} {...props}>
    <path d="m5 12 5 5 9-10" />
  </Stroke>
);

export const InfoIcon = (props: IconProps) => (
  <Stroke {...props}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v5" />
    <path d="M12 16h.01" />
  </Stroke>
);

export const LockIcon = (props: IconProps) => (
  <Stroke strokeWidth={2} {...props}>
    <rect x="4" y="10" width="16" height="11" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Stroke>
);

export const MenuIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </Stroke>
);

export const CloseIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </Stroke>
);
