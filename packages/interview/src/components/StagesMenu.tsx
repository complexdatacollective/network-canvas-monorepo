'use client';

import { LayoutTemplate, Search } from 'lucide-react';
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import InterfacePicture from '@codaco/interface-images/InterfacePicture';
import manifest, {
  type InterfaceType,
} from '@codaco/interface-images/manifest';

/**
 * The minimal stage shape the menu needs. Note we surface the author-supplied
 * stage `label` here, which is otherwise hidden from participants (#663). That
 * is the intended exception for this opt-in navigation menu — it is the only
 * way to make stages individually selectable.
 */
export type StageSummary = {
  id: string;
  type: string;
  label?: string;
};

type StagesMenuProps = {
  /** Authored stages only (the appended FinishSession sentinel is excluded). */
  stages: StageSummary[];
  /** Index of the stage currently displayed, for the active marker. */
  currentStageIndex: number;
  /** Skipped state keyed by stage index (from `getSkipMap`). */
  skipMap: Record<number, boolean>;
  /** Called with the chosen stage index when an item is activated. */
  onSelect: (index: number) => void;
};

const isInterfaceType = (type: string): type is InterfaceType =>
  Object.hasOwn(manifest, type);

/**
 * The body of the expanding stages menu: a vertical timeline of every authored
 * stage (number + label), with the current stage marked, skip-logic-hidden
 * stages de-emphasised, a filter, and full keyboard listbox navigation. Pure
 * (no Redux/dialog access) so it is trivially unit/Storybook-testable; the
 * Navigation component wraps it in the expanding panel + backdrop.
 */
export default function StagesMenu({
  stages,
  currentStageIndex,
  skipMap,
  onSelect,
}: StagesMenuProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stages
      .map((stage, index) => ({ stage, index }))
      .filter(({ stage, index }) => {
        if (!q) {
          return true;
        }
        const label = (stage.label ?? '').toLowerCase();
        // Match the visible label or the 1-based position the participant sees.
        return label.includes(q) || String(index + 1).includes(q);
      });
  }, [stages, query]);

  // Roving-tabindex active position (index into `filtered`). Start on the
  // current stage so it is focused/scrolled to when the menu opens.
  const initialPos = Math.max(
    0,
    filtered.findIndex(({ index }) => index === currentStageIndex),
  );
  const [activePos, setActivePos] = useState(initialPos);

  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Reset the active option to the top of the list whenever the filter changes.
  useEffect(() => {
    setActivePos(0);
  }, [query]);

  // Scroll the current stage into view on first render.
  const didScrollRef = useRef(false);
  useEffect(() => {
    if (didScrollRef.current) {
      return;
    }
    didScrollRef.current = true;
    optionRefs.current[initialPos]?.scrollIntoView({ block: 'center' });
  }, [initialPos]);

  const focusOption = (pos: number) => {
    const clamped = Math.max(0, Math.min(pos, filtered.length - 1));
    setActivePos(clamped);
    optionRefs.current[clamped]?.focus();
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusOption(activePos + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusOption(activePos - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusOption(0);
        break;
      case 'End':
        event.preventDefault();
        focusOption(filtered.length - 1);
        break;
      default:
        break;
    }
    // Enter/Space activate the focused option natively (it is a <button>).
  };

  return (
    <div className="flex h-full flex-col">
      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <Paragraph margin="none" className="text-text/70 text-sm">
            Nothing matched your search term.
          </Paragraph>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div
            role="listbox"
            aria-label="Stages"
            tabIndex={-1}
            onKeyDown={handleListKeyDown}
            className="relative flex flex-col px-4 py-4"
          >
            {/* One continuous timeline line behind the per-stage dots, running
             * the full height of the list. */}
            <span
              aria-hidden
              className="bg-neon-coral/40 pointer-events-none absolute inset-y-0 left-7 w-1 -translate-x-1/2 rounded-full"
            />
            {filtered.map(({ stage, index }, pos) => {
              const isCurrent = index === currentStageIndex;
              const isSkipped = skipMap[index] === true;
              return (
                <div key={stage.id} className="flex items-stretch">
                  {/* Timeline rail: a dot per stage, sitting on the line. */}
                  <span
                    aria-hidden
                    className="relative flex w-6 shrink-0 items-center justify-center"
                  >
                    <span
                      className={cx(
                        'bg-neon-coral relative z-10 rounded-full transition-all',
                        isCurrent
                          ? 'ring-neon-coral/30 size-4 ring-4'
                          : isSkipped
                            ? 'size-2.5 opacity-50'
                            : 'size-3',
                      )}
                    />
                  </span>
                  <button
                    ref={(element) => {
                      optionRefs.current[pos] = element;
                    }}
                    type="button"
                    role="option"
                    aria-selected={pos === activePos}
                    aria-current={isCurrent ? 'step' : undefined}
                    tabIndex={pos === activePos ? 0 : -1}
                    onClick={() => onSelect(index)}
                    onFocus={() => setActivePos(pos)}
                    className={cx(
                      'focusable my-1 flex flex-1 items-center gap-3 rounded-sm px-4 py-3 text-left transition-colors',
                      isCurrent
                        ? 'bg-primary text-primary-contrast'
                        : 'hover:bg-accent bg-transparent',
                      isSkipped && !isCurrent && 'opacity-60',
                    )}
                  >
                    <span className="flex aspect-video w-32 shrink-0 items-center justify-center overflow-hidden rounded-xs bg-black/20">
                      {isInterfaceType(stage.type) ? (
                        <InterfacePicture
                          type={stage.type}
                          ratio="16:9"
                          sizes="8rem"
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <LayoutTemplate className="size-6 opacity-40" />
                      )}
                    </span>
                    <span className="text-sm font-bold tabular-nums opacity-70">
                      {index + 1}.
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-bold tracking-wider wrap-break-word uppercase">
                      {stage.label?.trim() ? stage.label : 'Untitled stage'}
                    </span>
                    {isSkipped && (
                      <Badge variant="secondary" className="shrink-0">
                        Skipped
                      </Badge>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
      <div className="border-text/10 shrink-0 border-t p-4">
        <InputField
          type="search"
          value={query}
          onChange={(value) => setQuery(value ?? '')}
          placeholder="Filter..."
          aria-label="Filter stages"
          prefixComponent={<Search className="size-4" />}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'ArrowUp' && filtered.length > 0) {
              event.preventDefault();
              focusOption(filtered.length - 1);
            }
          }}
        />
      </div>
    </div>
  );
}
