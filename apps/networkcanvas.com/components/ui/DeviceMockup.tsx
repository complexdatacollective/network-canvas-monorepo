import type { ReactNode } from 'react';

import Node from '@codaco/fresco-ui/Node';
import { cn } from '~/lib/cn';

export type Variant = 'interviewer' | 'architect' | 'fresco';

const screenDots = (
  <div className="flex gap-1.5">
    <span className="size-2.5 rounded-full bg-white/30" />
    <span className="size-2.5 rounded-full bg-white/30" />
    <span className="size-2.5 rounded-full bg-white/30" />
  </div>
);

function InterviewerScreen() {
  const nodes = [
    { label: 'Alex', color: 'node-color-seq-1' as const },
    { label: 'Sam', color: 'node-color-seq-1' as const },
    { label: 'Jordan', color: 'node-color-seq-1' as const },
    { label: 'Riley', color: 'node-color-seq-1' as const },
    { label: 'Casey', color: 'node-color-seq-1' as const },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <span className="size-6 rounded-full bg-white/20" />
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                'size-2 rounded-full',
                i === 1 ? 'bg-neon-coral' : 'bg-white/25',
              )}
            />
          ))}
        </div>
        {screenDots}
      </div>
      <p className="mt-5 text-center text-sm font-bold text-white/90">
        Who do you know that you discuss important matters with?
      </p>
      <div className="mt-auto flex flex-wrap items-end justify-center gap-3 py-4">
        {nodes.map((n) => (
          <Node key={n.label} label={n.label} color={n.color} size="xs" />
        ))}
      </div>
      <div className="mt-auto flex items-center gap-3 rounded-full bg-white/10 px-4 py-3">
        <span className="text-sm text-white/50">Add a name…</span>
        <span className="bg-neon-coral ml-auto flex size-7 items-center justify-center rounded-full text-white">
          +
        </span>
      </div>
    </div>
  );
}

function ArchitectScreen() {
  return (
    <div className="flex h-full gap-3">
      <div className="flex w-1/4 flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-8 rounded-lg bg-white/10" />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="h-5 w-24 rounded-full bg-white/15" />
          {screenDots}
        </div>
        <div className="grid flex-1 grid-cols-3 gap-3">
          {[
            'bg-sea-green',
            'bg-neon-coral',
            'bg-cerulean-blue',
            'bg-mustard',
            'bg-purple-pizazz',
            'bg-sea-serpent',
          ].map((c, i) => (
            <span key={i} className={cn('rounded-2xl opacity-90', c)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FrescoScreen() {
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="h-5 w-28 rounded-full bg-white/15" />
        {screenDots}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2"
        >
          <span
            className={cn(
              'size-5 rounded-full',
              [
                'bg-neon-coral',
                'bg-sea-serpent',
                'bg-purple-pizazz',
                'bg-mustard',
                'bg-kiwi',
                'bg-cerulean-blue',
              ][i],
            )}
          />
          <span className="h-3 flex-1 rounded-full bg-white/12" />
          <span className="h-3 w-12 rounded-full bg-white/12" />
        </div>
      ))}
    </div>
  );
}

const screens: Record<Variant, ReactNode> = {
  interviewer: <InterviewerScreen />,
  architect: <ArchitectScreen />,
  fresco: <FrescoScreen />,
};

export function DeviceMockup({
  variant = 'interviewer',
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-cyber-grape tablet-landscape:p-5 aspect-4/3 w-full rounded-[1.75rem] p-4 shadow-2xl',
        className,
      )}
    >
      <div className="bg-cyber-grape-dark tablet-landscape:p-5 h-full rounded-[1.25rem] p-4">
        {screens[variant]}
      </div>
    </div>
  );
}
