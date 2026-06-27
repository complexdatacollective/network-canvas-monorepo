import type { SVGProps } from 'react';

export default function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <title>Camera</title>
      <path d="M9.293 2.293A1 1 0 0 1 10 2h4a1 1 0 0 1 .707.293L16.414 4H20a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3.586L9.293 2.293ZM10.414 4 8.707 5.707A1 1 0 0 1 8 6H4v13h16V6h-4a1 1 0 0 1-.707-.293L13.586 4h-3.172ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-5 3a5 5 0 1 1 10 0 5 5 0 0 1-10 0Z" />
    </svg>
  );
}
