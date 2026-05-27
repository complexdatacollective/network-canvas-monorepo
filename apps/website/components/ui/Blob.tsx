import { cn } from '~/lib/cn';

type BlobProps = {
  src: string;
  className?: string;
};

/** Decorative pastel background blob. Purely presentational. */
export function Blob({ src, className }: BlobProps) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className={cn(
        'pointer-events-none absolute -z-10 opacity-30 blur-[2px] select-none',
        className,
      )}
    />
  );
}
