import Link from 'next/link';
import { type ReactNode } from 'react';

type ButtonPrimaryProps = {
  children: ReactNode;
  href: string;
};

function ButtonPrimary({ children, href }: ButtonPrimaryProps) {
  return (
    <Link
      className="btn inline-block rounded-md bg-violet-700 p-4 text-center text-white hover:bg-violet-800"
      style={{ textDecoration: 'none' }}
      href={href}
    >
      <span>{children}</span>
    </Link>
  );
}

export default ButtonPrimary;
