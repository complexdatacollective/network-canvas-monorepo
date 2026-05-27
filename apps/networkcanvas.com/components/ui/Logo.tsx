import { cn } from '~/lib/cn';

type LogoProps = {
  className?: string;
  showWordmark?: boolean;
  markClassName?: string;
};

export function Logo({
  className,
  showWordmark = true,
  markClassName,
}: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <img
        src="/images/logos/network-canvas-mark.svg"
        alt=""
        aria-hidden
        className={cn('h-9 w-9', markClassName)}
      />
      {showWordmark ? (
        <span className="font-heading text-cyber-grape text-lg font-bold tracking-[0.18em]">
          Network Canvas
        </span>
      ) : null}
    </span>
  );
}
