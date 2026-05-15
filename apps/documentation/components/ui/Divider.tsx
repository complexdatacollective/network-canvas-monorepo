import { cn } from '~/lib/utils';

export const Divider = ({ className }: { className?: string }) => (
  <hr
    className={cn(
      'border-foreground mx-auto w-full rounded-full border-[1.5px]',
      className,
    )}
  />
);
