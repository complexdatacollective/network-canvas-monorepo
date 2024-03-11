import { Heading } from '@codaco/ui';
import { type ReactNode } from 'react';
import { cn } from '~/lib/utils';

export type PopoutBoxProps = {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  iconClassName?: string;
  className?: string;
};

const PopoutBox = ({
  title,
  children,
  icon,
  className,
  iconClassName,
}: PopoutBoxProps) => {
  return (
    <aside
      className={cn(
        'relative mx-8 mb-8 mt-10 rounded-lg bg-card px-10 py-8',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'absolute -left-6 -top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md',
            iconClassName,
          )}
        >
          {icon}
        </div>
      )}
      <div className="flex-auto">
        <Heading variant="h4">{title}</Heading>
        {children}
      </div>
    </aside>
  );
};

export default PopoutBox;
