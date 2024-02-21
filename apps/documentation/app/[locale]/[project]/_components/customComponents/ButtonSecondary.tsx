import Link from 'next/link';
import { type ReactNode } from 'react';

type ButtonSecondaryProps = {
  children: ReactNode;
  href: string;
};

function ButtonSecondary({ children, href }: ButtonSecondaryProps) {
  return (
    <Link
      className="btn inline-block rounded-md bg-slate-100 p-4 text-center text-violet-600 hover:bg-slate-200"
      style={{ textDecoration: 'none' }}
      href={href}
    >
      <span>{children}</span>
    </Link>
  );
}

export default ButtonSecondary;
