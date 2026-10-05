'use client';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';

import { messages } from '../../messages';
import { DASHED_PATTERN, EDGE_WIDTH } from './EdgeRenderer';

type KeyEntry = {
  label: MessageDescriptor;
  strokeWidth: number;
  strokeDasharray?: string;
};

const KEY_ENTRIES: KeyEntry[] = [
  {
    label: messages.biologicalKey,
    strokeWidth: EDGE_WIDTH,
  },
  {
    label: messages.socialKey,
    strokeWidth: EDGE_WIDTH,
    strokeDasharray: DASHED_PATTERN,
  },
];

const LINE_WIDTH = 48;
const LINE_Y = 10;

function KeyLine({ entry, color }: { entry: KeyEntry; color: string }) {
  return (
    <svg width={LINE_WIDTH} height={20} aria-hidden="true">
      <line
        x1={0}
        y1={LINE_Y}
        x2={LINE_WIDTH}
        y2={LINE_Y}
        stroke={color}
        strokeWidth={entry.strokeWidth}
        strokeDasharray={entry.strokeDasharray}
        strokeLinecap="round"
      />
    </svg>
  );
}

type PedigreeKeyProps = {
  color: string;
} & React.HTMLAttributes<HTMLDivElement>;

export default function PedigreeKey({ color, ...props }: PedigreeKeyProps) {
  return (
    <div {...props}>
      {KEY_ENTRIES.map((entry) => (
        <div key={entry.label.id} className="flex items-center gap-3">
          <KeyLine entry={entry} color={color} />
          <span className="text-sm">
            <AppMessage message={entry.label} />
          </span>
        </div>
      ))}
    </div>
  );
}
