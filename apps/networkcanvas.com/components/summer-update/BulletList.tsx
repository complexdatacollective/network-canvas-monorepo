import type { ReactNode } from 'react';

import { cn } from '~/lib/cn';

import {
  accentBackgroundClasses,
  type AccentColor,
} from './summerUpdateColors';

export function BulletList({
  items,
}: {
  items: readonly { color: AccentColor; content: ReactNode }[];
}) {
  return (
    <ul className="mt-6 space-y-4">
      {items.map((item, index) => (
        <li className="flex items-start gap-4" key={index}>
          <span
            aria-hidden
            className={cn(
              'mt-2 size-2.5 shrink-0 rounded-full',
              accentBackgroundClasses[item.color],
            )}
          />
          <span>{item.content}</span>
        </li>
      ))}
    </ul>
  );
}
