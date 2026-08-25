import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronDown } from 'lucide-react';
import type React from 'react';
import { useId } from 'react';

import Button from '@codaco/fresco-ui/Button';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import { cx } from '~/utils/cva';

/**
 * The shared disclosure every synthetic-parameter surface renders: a collapsed
 * row carrying a resolved-value summary, which expands to reveal the parameter
 * editors (spec, governing rule 4). Used by the stage-editor sections, the
 * codebook variable sub-editor, and the NodePanel probability editor, so the
 * three surfaces cannot drift on the collapsed treatment.
 *
 * The row carries NO authored/default indicator (spec revision 2, item 3): a
 * researcher is told what a run would do, not which half of the protocol file
 * the number came from. What survives of that distinction is the affordance
 * that acts on it — "Reset to default", rendered exactly while the block is
 * authored, so its presence is the only thing that ever needed to say so.
 *
 * Founded on Base UI's Collapsible, which supplies the disclosure semantics —
 * a real button trigger with `aria-expanded`/`aria-controls` wiring — so the
 * row is keyboard operable and announces its state for free. Expansion is
 * DISCLOSURE, not authoring: collapsing changes nothing, and the only way
 * back to the schema default is the explicit reset affordance.
 *
 * `onOpenChange` is surfaced because expansion is load-bearing for one
 * consumer: the TypeEditor's option-weights column reveals while the
 * variable's section is expanded (spec, option weights reveal).
 */

const RESET_LABEL = 'Reset to default';

export type SyntheticSectionProps = {
  /** Short name of the parameter surface, e.g. "Synthetic data". */
  title: string;
  /**
   * The one-line resolved-parameter summary, always visible in the header so
   * the collapsed row says what generation would do. Derive it from a parse
   * of the current draft (see `summaries.ts`), never from raw form state.
   */
  summary: React.ReactNode;
  /**
   * Whether the surface carries authored keys in the draft (spec rule 4:
   * authored = key present; default = key absent). The one thing it decides is
   * whether the reset affordance renders — there is nothing to reset to when
   * the surface is already at the schema default.
   */
  authored: boolean;
  /**
   * Removes the authored keys, returning the surface to the schema default.
   * Rendered only while `authored` is true.
   */
  onReset?: () => void;
  /** The parameter editors, revealed on expansion. */
  children: React.ReactNode;
  /** Controlled expansion state; leave undefined for uncontrolled use. */
  open?: boolean;
  /** Initial expansion for uncontrolled use. Collapsed by default (rule 4). */
  defaultOpen?: boolean;
  /** Observe expansion (e.g. the option-weights column reveal). */
  onOpenChange?: (open: boolean) => void;
  /**
   * Keep the panel contents mounted while collapsed. Off by default; a
   * consumer whose fields must stay registered with a form opts in.
   */
  keepMounted?: boolean;
  id?: string;
  className?: string;
};

export function SyntheticSection({
  title,
  summary,
  authored,
  onReset,
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  keepMounted = false,
  id,
  className,
}: SyntheticSectionProps) {
  const titleId = useId();
  const resetLabelId = useId();

  return (
    <Collapsible.Root
      {...(open === undefined ? {} : { open })}
      defaultOpen={defaultOpen}
      // Narrowed to the boolean: Base UI also passes event details, which are
      // no part of this component's contract.
      onOpenChange={(nextOpen: boolean) => onOpenChange?.(nextOpen)}
      {...(id === undefined ? {} : { id })}
      className={cx('w-full min-w-0', className)}
    >
      <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Collapsible.Trigger
          className={cx(
            'focusable flex min-w-0 flex-1 basis-64 cursor-pointer items-center gap-3 rounded px-1 py-2 text-start',
          )}
        >
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 transition-transform [[data-panel-open]>&]:rotate-180"
          />
          <span
            id={titleId}
            className={cx(
              headingVariants({ level: 'label', margin: 'none' }),
              'shrink-0',
            )}
          >
            {title}
          </span>
          <span className="text-text/70 min-w-0 flex-1 truncate text-sm">
            {summary}
          </span>
        </Collapsible.Trigger>
        {authored && onReset ? (
          <Button
            variant="text"
            size="sm"
            onClick={onReset}
            // Named by its own label plus the section title, so a screen
            // reader listing several sections' reset buttons can tell them
            // apart ("Reset to default, Synthetic data").
            aria-labelledby={`${resetLabelId} ${titleId}`}
            className="shrink-0"
          >
            <span id={resetLabelId}>{RESET_LABEL}</span>
          </Button>
        ) : null}
      </div>
      <Collapsible.Panel
        keepMounted={keepMounted}
        className={cx(
          // Base UI publishes the measured height; the transition collapses
          // it. The global reduced-motion rule zeroes the duration.
          'h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0',
        )}
      >
        <div className="min-w-0 ps-8 pt-2 pb-1">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
