import Image from 'next/image';

export function ScreenshotFrame({
  address,
  alt,
  src,
}: {
  address: string;
  alt: string;
  src: string;
}) {
  return (
    <div className="elevation-medium bg-surface overflow-hidden rounded">
      <div
        className="flex items-center gap-2 border-b border-current/10 px-4 py-3"
        aria-hidden
      >
        <span className="bg-neon-coral size-2.5 rounded-full" />
        <span className="bg-mustard size-2.5 rounded-full" />
        <span className="bg-sea-green size-2.5 rounded-full" />
        <span className="font-monospace ml-2 truncate text-xs text-current/55">
          {address}
        </span>
      </div>
      <div className="relative aspect-4/3 overflow-hidden bg-white">
        <Image
          fill
          src={src}
          alt={alt}
          sizes="(min-width: 801px) 50vw, 100vw"
          className="fit"
        />
      </div>
    </div>
  );
}
