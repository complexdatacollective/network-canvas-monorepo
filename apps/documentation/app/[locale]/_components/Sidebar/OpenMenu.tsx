import { type ReactNode } from 'react';
import { Link } from '@/navigation';

type OpenMenuProps = {
  children: ReactNode;
  title: string;
  titleURL: string | null;
  highlighted: boolean;
};

const OpenMenu = ({
  children,
  title,
  titleURL,
  highlighted,
}: OpenMenuProps) => {
  return (
    <div>
      {titleURL ? (
        <Link
          className={`${
            highlighted && 'text-blue-600'
          } text-xs font-bold transition-colors`}
          href={titleURL}
        >
          {title}
        </Link>
      ) : (
        <p className="text-xs">{title}</p>
      )}
      <div>{children}</div>
    </div>
  );
};

export default OpenMenu;
