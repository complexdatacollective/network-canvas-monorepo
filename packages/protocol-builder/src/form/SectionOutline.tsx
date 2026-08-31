import { AlertCircle, Check, Circle, MinusCircle } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  type OutlineSection,
  type SectionOutlineStatus,
  sectionOutlineStatus,
} from './outlineStore.ts';
import { useStageEditorForm } from './stageEditorContext.ts';

/**
 * Status is carried by an icon AND by words, never by colour alone: the four
 * states are the difference between "you still have work here" and "this is
 * done", which nobody should have to distinguish by hue.
 */
const STATUS_PRESENTATION: Record<
  SectionOutlineStatus,
  Readonly<{ label: string; icon: typeof Check; className: string }>
> = {
  error: {
    label: 'Has a problem',
    icon: AlertCircle,
    className: 'text-destructive',
  },
  incomplete: {
    label: 'Not finished',
    icon: Circle,
    className: 'text-current/60',
  },
  complete: { label: 'Finished', icon: Check, className: 'text-success' },
  disabled: {
    label: 'Switched off',
    icon: MinusCircle,
    className: 'text-current/40',
  },
};

/**
 * The stage editor's section list.
 *
 * One control per section, so a researcher editing a long stage can see how
 * much of it is done and get to any part of it without scrolling. Where there
 * is room it sits alongside the form and stays put while the form scrolls;
 * where there is not, the same list becomes a row of chips above the form.
 * It is the same navigation either way — one implementation, one set of
 * semantics, and nothing that only works at one size.
 */
export default function SectionOutline() {
  const { outline } = useStageEditorForm();
  const sections = useSyncExternalStore(
    outline.subscribe,
    outline.getSnapshot,
    outline.getServerSnapshot,
  );

  if (sections.length === 0) return null;

  return (
    <nav
      aria-label="Stage sections"
      className="@min-[60rem]:sticky @min-[60rem]:top-0 @min-[60rem]:max-h-dvh @min-[60rem]:overflow-y-auto @min-[60rem]:py-14"
    >
      <ol className="flex list-none gap-2 overflow-x-auto p-0 @min-[60rem]:flex-col @min-[60rem]:overflow-visible">
        {sections.map((section) => (
          <li key={section.id} className="shrink-0">
            <SectionOutlineItem section={section} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SectionOutlineItem({ section }: { section: OutlineSection }) {
  const status = useFormStore((state) =>
    sectionOutlineStatus(section, {
      getFieldState: (name) => state.getFieldState(name),
      getFieldErrors: (name) => state.getFieldErrors(name),
    }),
  );
  const presentation = STATUS_PRESENTATION[status];
  const StatusIcon = presentation.icon;

  return (
    <button
      type="button"
      onClick={() => focusSection(section.id)}
      className="focusable flex w-full cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-current/5"
    >
      <StatusIcon
        aria-hidden
        className={cx('size-4 shrink-0', presentation.className)}
      />
      <span className="truncate">{section.title}</span>
      <span className="sr-only">{presentation.label}</span>
    </button>
  );
}

/**
 * Moves focus to the section rather than only scrolling to it, so a keyboard
 * or screen-reader user actually arrives: the section element is a region
 * named by its own heading, so taking focus announces which section this is.
 */
function focusSection(sectionId: string): void {
  const section = document.getElementById(sectionId);
  if (section === null) return;
  section.focus({ preventScroll: true });
  // Focus alone would scroll abruptly, so the smooth journey is the
  // enhancement and arriving is the guarantee.
  section.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
