import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { motion } from 'motion/react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import { cx } from '@codaco/fresco-ui/utils/cva';

import type { Practice } from './parseWalkthrough';

const messages = defineMessages({
  do: {
    id: 'architect.stageEditor.walkthrough.do',
    defaultMessage: 'Do',
    description: 'Heading over recommended practices in the stage walkthrough.',
  },
  avoid: {
    id: 'architect.stageEditor.walkthrough.avoid',
    defaultMessage: 'Avoid',
    description: 'Heading over practices to avoid in the stage walkthrough.',
  },
});

const PRESENTATION = {
  do: {
    icon: ThumbsUp,
    label: messages.do,
    card: 'bg-success/10',
    badge: 'bg-success text-success-contrast',
    bullet: 'bg-success',
  },
  avoid: {
    icon: ThumbsDown,
    label: messages.avoid,
    card: 'bg-destructive/8',
    badge: 'bg-destructive text-destructive-contrast',
    bullet: 'bg-destructive',
  },
} as const;

type Group = Readonly<{ kind: Practice['kind']; items: string[] }>;

function groupByKind(items: readonly Practice[]): Group[] {
  const groups: { kind: Practice['kind']; items: string[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last?.kind === item.kind) last.items.push(item.text);
    else groups.push({ kind: item.kind, items: [item.text] });
  }
  return groups;
}

/**
 * Do / avoid guidance. Consecutive points of the same kind share one card,
 * so a run of them reads as a set rather than as separate warnings.
 */
export default function Practices({
  items,
}: Readonly<{ items: readonly Practice[] }>) {
  const intl = useAppIntl();
  const reducedMotion = usePrefersReducedMotion() === true;

  return (
    <div className="flex flex-col gap-2">
      {groupByKind(items).map((group, groupIndex) => {
        const {
          icon: Icon,
          label,
          card,
          badge,
          bullet,
        } = PRESENTATION[group.kind];
        const heading = intl.formatMessage(label);
        return (
          <motion.section
            key={groupIndex}
            aria-label={heading}
            className={cx('rounded px-4 py-3', card)}
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              type: 'spring',
              duration: 0.4,
              bounce: 0.2,
              delay: 0.15 + groupIndex * 0.1,
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                aria-hidden
                className={cx(
                  'grid size-6 shrink-0 place-items-center rounded-full',
                  badge,
                )}
              >
                <Icon className="size-3.5" strokeWidth={2.75} />
              </span>
              <span className="font-heading text-xs font-extrabold tracking-wider uppercase">
                {heading}
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 ps-8">
              {group.items.map((text, index) => (
                <li key={index} className="relative text-sm">
                  <span
                    aria-hidden
                    className={cx(
                      'absolute -inset-s-4 top-[0.6em] size-1.5 rounded-full',
                      bullet,
                    )}
                  />
                  <RenderMarkdown render={<span />}>{text}</RenderMarkdown>
                </li>
              ))}
            </ul>
          </motion.section>
        );
      })}
    </div>
  );
}
