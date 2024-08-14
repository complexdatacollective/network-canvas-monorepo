import { Heading } from '@codaco/ui';
import { type ReactNode } from 'react';
import { cn } from '~/lib/utils';

export type PopoutBoxProps = {
  title?: string;
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
        'my-5',
        'md:mt-10', // additional margin when icon is shown
        'mx-0 flex items-center gap-2 rounded-lg bg-card p-4 text-base-sm',
        'md:relative md:mx-8 md:gap-0 md:px-10 md:py-8',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'hidden h-12 w-12 shrink-0 scale-75 items-center justify-center rounded-full bg-foreground shadow-md md:flex',
            'md:absolute md:-left-6 md:-top-4 md:scale-100',
            iconClassName,
          )}
        >
          {icon}
        </div>
      )}
      <div className="max-w-full flex-auto">
        {title && (
          <Heading variant="h4" className="mb-2">
            {title}
          </Heading>
        )}
        {children}
      </div>
    </aside>
  );
};

export default PopoutBox;
