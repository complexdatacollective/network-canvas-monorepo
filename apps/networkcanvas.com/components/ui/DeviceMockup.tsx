import Image from 'next/image';

import { cn } from '~/lib/cn';

export type Variant = 'interviewer' | 'architect' | 'fresco';

const screenshots: Record<Variant, { src: string; alt: string }> = {
  architect: {
    src: '/images/screenshots/architect.png',
    alt: 'Architect protocol editor showing an interview design',
  },
  interviewer: {
    src: '/images/screenshots/interviewer.png',
    alt: 'Interviewer home screen showing available Network Canvas protocols',
  },
  fresco: {
    src: '/images/screenshots/fresco.png',
    alt: 'Fresco dashboard showing protocol, participant, and interview totals',
  },
};

export function DeviceMockup({
  variant = 'interviewer',
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  const screenshot = screenshots[variant];

  return (
    <div
      className={cn(
        'bg-cyber-grape tablet-landscape:p-4 w-full rounded-[1.75rem] p-3 shadow-2xl',
        className,
      )}
    >
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-[1.25rem] bg-black/10">
        <Image
          fill
          src={screenshot.src}
          alt={screenshot.alt}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-contain"
        />
      </div>
    </div>
  );
}
