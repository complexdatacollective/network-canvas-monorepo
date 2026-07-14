import { useTranslations } from 'next-intl';
import Image from 'next/image';

import { cn } from '~/lib/cn';

export type Variant = 'interviewer' | 'architect' | 'fresco';

const screenshots: Record<Variant, { src: string }> = {
  architect: {
    src: '/images/screenshots/architect.png',
  },
  interviewer: {
    src: '/images/screenshots/interviewer.png',
  },
  fresco: {
    src: '/images/screenshots/fresco.png',
  },
};

export function DeviceMockup({
  variant = 'interviewer',
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  const t = useTranslations('Tools');
  const screenshot = screenshots[variant];

  return (
    <div
      className={cn(
        'bg-cyber-grape tablet-landscape:p-4 w-full rounded p-3 shadow-2xl',
        className,
      )}
    >
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-[1.25rem] bg-black/10">
        <Image
          fill
          src={screenshot.src}
          alt={t(`${variant}.screenshotAlt`)}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-contain"
        />
      </div>
    </div>
  );
}
