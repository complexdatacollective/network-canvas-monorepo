import type { CSSProperties, SVGProps } from 'react';

type IconStyle = CSSProperties & {
  '--icon-tone-primary'?: string;
  '--icon-tone-secondary'?: string;
};

export default function Icon({ style, ...props }: SVGProps<SVGSVGElement>) {
  const iconStyle: IconStyle = {
    '--icon-tone-primary': 'oklch(var(--platinum--dark))',
    '--icon-tone-secondary': 'oklch(var(--platinum))',
    ...style,
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 60"
      style={iconStyle}
      {...props}
    >
      <title>Links</title>
      <circle fill="var(--icon-tone-primary)" cx="49" cy="11" r="11" />
      <circle fill="var(--icon-tone-primary)" cx="49" cy="49" r="11" />
      <circle fill="var(--icon-tone-primary)" cx="11" cy="30" r="11" />
      <path
        fill="var(--icon-tone-primary)"
        d="M10.001 31.735l2-3.465L44.6 47.09l-2 3.465z"
      />
      <path
        fill="var(--icon-tone-primary)"
        d="M9.997 28.272l32.6-18.814 2 3.464-32.6 18.815z"
      />
      <path
        fill="var(--icon-tone-secondary)"
        d="M3.22 22.22l15.56 15.56A11 11 0 1 1 3.22 22.22zM41.22 3.22l15.56 15.56A11 11 0 1 1 41.22 3.22zM41.22 41.22l15.56 15.56a11 11 0 1 1-15.56-15.56z"
      />
    </svg>
  );
}
