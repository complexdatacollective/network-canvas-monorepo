import { CalendarPlus, CalendarSync, Globe, Trash2 } from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Link } from 'wouter';

import { Pattern } from '@codaco/art';
import { buttonVariants, IconButton } from '@codaco/fresco-ui/Button';
import { proportionalLucideIconVariants } from '@codaco/fresco-ui/styles/controlVariants';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { ProtocolWithCounts } from '~/lib/db/types';

import { cardBase } from './cardStyles';

function Pill({
  children,
  icon,
  intent,
}: {
  children: ReactNode;
  icon: ReactNode;
  intent?: 'default' | 'error' | 'success' | 'warning';
}) {
  return (
    <div
      className={cx(
        'font-monospace flex items-center gap-2 rounded-full border px-[2cqi] py-[0.75cqi] text-[max(12px,2.5cqi)] uppercase',
        proportionalLucideIconVariants(),
        'backdrop-blur-xs',
        intent === 'error' &&
          'text-destructive border-destructive bg-[color-mix(in_oklab,oklch(var(--destructive))_10%,oklch(var(--rich-black)))]/60',
        intent === 'success' &&
          'text-sea-green border-sea-green bg-[color-mix(in_oklab,oklch(var(--sea-green))_10%,oklch(var(--rich-black)))]/60',
        intent === 'warning' &&
          'text-neon-carrot border-neon-carrot bg-[color-mix(in_oklab,oklch(var(--neon-carrot))_20%,oklch(var(--rich-black)))]/60',
      )}
    >
      {icon}
      {children}
    </div>
  );
}

// CSS line-breaking treats `_` as part of a word, so an underscore is never a
// wrap opportunity on its own — only spaces, hyphens (`-`) and soft hyphens
// (U+00AD) break natively. Inject a <wbr> after each underscore so long
// machine-style names (e.g. "BRE_F03-KMP_FB_01…") can wrap there too. The
// greedy line breaker still prefers the earlier opportunities (space, then
// `-`, then `_`), falling back to hyphenation (hyphens-auto, below) only for
// an unbroken run that would otherwise overflow.
function withUnderscoreBreaks(name: string): ReactNode[] {
  const parts = name.split('_');
  return parts.flatMap((part, index) =>
    index < parts.length - 1 ? [`${part}_`, <wbr key={index} />] : [part],
  );
}

type DeckCardProps = {
  protocol: ProtocolWithCounts;
  isActive: boolean;
  sessionCount: number;
  onActivate: () => void;
  onDelete: () => void;
  requiresInternetConnection?: boolean;
};

// Description shows up to six lines, then trails off. line-clamp must be a
// static utility class so Tailwind's scanner emits it — a dynamic
// `line-clamp-${n}` would never be generated. The inner span carries the
// clamp (line-clamp makes it a `-webkit-box`); the wrapper is a normal block
// flex item pinned with `shrink-0` so the column — whose heading claims
// `flex-1` — can't squeeze the description below its six lines.
function DescriptionBlock({ text }: { text: string }) {
  return (
    <div className="shrink-0 text-left">
      <span className="line-clamp-6 text-[3.5cqi] leading-tight text-current/80">
        {text}
      </span>
    </div>
  );
}

export function DeckCard({
  protocol,
  isActive,
  sessionCount,
  onActivate,
  onDelete,
  requiresInternetConnection = false,
}: DeckCardProps) {
  const onCardKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Only the card itself activates. Key events bubbling up from the nested
    // delete button must not trigger a second action — that button handles
    // its own Enter/Space natively.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };

  return (
    <div
      aria-label={`${protocol.name}${isActive ? ' (active)' : ''}`}
      onKeyDown={onCardKeyDown}
      // Border echoes the color the Pattern paints for this protocol's seed.
      // style={{ borderColor: seedToPatternPalette(protocol.name).backgroundTop }}
      className={cx(
        cardBase(),
        'min-h-[300px] min-w-[325px]',
        'text-charcoal',
        '@container relative h-full w-full overflow-clip rounded shadow-xl',
        isActive && 'spring-medium shadow-2xl transition-transform',
        'border-platinum-dark border-[0.2cqi]',
      )}
    >
      <Pattern seed={protocol.name} className="absolute inset-0 size-full" />
      <div className="to-platinum from-rich-black/20 via-platinum/80 absolute inset-0 size-full bg-linear-to-b via-30% to-70%" />

      <div className="relative z-10 flex size-full flex-col justify-between gap-4 p-[6cqi]">
        <div className="flex items-center justify-end gap-4">
          {requiresInternetConnection && (
            <Pill icon={<Globe />} intent="warning">
              Requires Internet
            </Pill>
          )}
          <IconButton
            icon={<Trash2 />}
            aria-label="Delete Protocol"
            variant="outline"
            color="dynamic"
            className="bg-platinum/60 size-[max(40px,10cqi)] border text-[max(16px,4cqi)] text-current/60"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          />
        </div>
        <div className="flex flex-1 items-center justify-start">
          <Heading
            level="h2"
            className="w-full text-left text-[8cqi] leading-[1.1] font-black wrap-break-word hyphens-auto"
            margin="none"
          >
            {withUnderscoreBreaks(protocol.name)}
          </Heading>
        </div>
        {protocol.description && (
          <DescriptionBlock text={protocol.description} />
        )}
        <hr className="my-2" />
        <div className="font-monospace mb-[2cqi] flex items-center gap-4 text-[2.8cqi]">
          <span className="flex items-center gap-2">
            <CalendarPlus className="inline-block" size={16} />
            <TimeAgo date={protocol.importedAt} />
          </span>

          {protocol.lastModified && (
            <>
              <span className="flex items-center gap-2">
                <CalendarSync className="inline-block" size={16} />
                <TimeAgo date={protocol.lastModified} />
              </span>
            </>
          )}

          <Link href="/data" className="hover:underline">
            {sessionCount} {sessionCount === 1 ? 'interview' : 'interviews'}
          </Link>
        </div>
        <button
          onClick={onActivate}
          className={cx(
            buttonVariants({ color: 'success' }),
            'font-monospace border-sea-green-dark hidden h-auto border-b-[1.25cqi] p-[2.25cqi] text-[3.5cqi] tracking-wide uppercase',
            isActive && 'inline-flex',
          )}
        >
          Start new interview
        </button>
      </div>
    </div>
  );
}
