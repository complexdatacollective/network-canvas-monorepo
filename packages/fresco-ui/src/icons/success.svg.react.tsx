import type { SVGProps } from 'react';

export default function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" {...props}>
      <title>Success</title>
      <path
        className="fill-slate-blue"
        d="M50.57 105.66 39.2 171.83 70 158.06 90 180l10.88-63.3z"
      />
      <path
        className="fill-slate-blue-dark"
        d="m129.43 105.66 11.37 66.17-30.8-13.77L90 180l-10.88-63.3z"
      />
      <circle className="fill-platinum" cx="90" cy="76" r="58" />
      <path
        className="fill-platinum-dark"
        d="M131.01 34.99 48.99 117.01a58 58 0 0 0 82.02-82.02z"
      />
      <path
        className="stroke-sea-green-dark"
        d="m65.58 79.14 18.23 18.23"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="14"
      />
      <path
        className="stroke-sea-green"
        d="m83.81 97.37 30.61-30.61"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="14"
      />
    </svg>
  );
}
