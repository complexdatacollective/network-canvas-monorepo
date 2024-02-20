import { Link } from '@/navigation';
import React from 'react';

type HeaderLinkProps = {
  id: string;
  children: React.ReactNode;
  className?: string;
};

const HeaderLink = ({ id, children, className }: HeaderLinkProps) => {
  return (
    <Link
      className={`group flex items-center gap-1.5 no-underline transition-all hover:text-blue-400 ${className} `}
      href={`#${id}`}
    >
      {children}
    </Link>
  );
};

export default HeaderLink;
