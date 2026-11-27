'use client';

import { Toggle } from '@base-ui/react/toggle';
import { Toolbar } from '@base-ui/react/toolbar';
import {
  createContext,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useState,
} from 'react';

import { buttonVariants, iconButtonVariants } from '../../../Button';
import { placeToolbarRules, type ToolbarLinePart } from './toolbarLines';

/**
 * Whether the toolbar is unavailable because the FIELD is — read-only, or
 * disabled while its form submits — rather than because of where the caret
 * happens to be.
 *
 * The two are different states, and a button says them differently. A live
 * toolbar keeps an unavailable button focusable and marked `aria-disabled`,
 * which is what the ARIA toolbar pattern asks for: a keyboard user can arrow
 * onto Undo and be told there is nothing to undo. A toolbar belonging to a
 * field nobody can edit has nothing to go and read, so its buttons are
 * unavailable the way every other control on the form is — disabled outright,
 * and out of the tab order.
 */
const FieldUnavailableContext = createContext(false);

function useUnavailableProps() {
  const unavailable = useContext(FieldUnavailableContext);
  return unavailable
    ? ({ 'focusableWhenDisabled': false, 'aria-disabled': true } as const)
    : {};
}

/** A button of the toolbar that is pressed or not, inside a toggle group. */
export const ToolbarToggleButton = (props: Toolbar.Button.Props) => {
  const unavailable = useUnavailableProps();
  return <Toolbar.Button {...props} {...unavailable} render={<Toggle />} />;
};

/** A button of the toolbar. */
export const ToolbarButton = (props: Toolbar.Button.Props) => {
  const unavailable = useUnavailableProps();
  return <Toolbar.Button {...props} {...unavailable} />;
};

/** How a toolbar button that shows an icon is drawn. */
export const toolbarButtonStyles = iconButtonVariants({
  size: 'sm',
  color: 'dynamic',
  variant: 'text',
  className:
    'text-base data-pressed:bg-primary data-pressed:text-primary-contrast [&>.lucide]:h-[1.2em] [&>.lucide]:w-[1.2em] [&>.lucide]:[stroke-width:2.4]',
});

/**
 * How a toolbar button with an icon and a short label is drawn, such as
 * “Field” in a form's toolbar: as tall as the icon buttons beside it, its
 * icon drawn as theirs are, and filled while it is pressed or while the menu
 * it opens is open.
 */
export const toolbarLabelledButtonStyles = buttonVariants({
  size: 'sm',
  color: 'dynamic',
  variant: 'text',
  textStyle: 'default',
  className:
    'h-10 gap-1.5 px-2.5 text-sm data-pressed:bg-primary data-pressed:text-primary-contrast data-popup-open:bg-primary data-popup-open:text-primary-contrast [&_.lucide]:h-[1.2em] [&_.lucide]:w-[1.2em] [&_.lucide]:shrink-0 [&_.lucide]:[stroke-width:2.4]',
});

/** One group of the toolbar: what it is called, and the controls in it. */
export type ToolbarGroup = Readonly<{
  key: string;
  /** Read by a screen reader only, so English like the controls' own names. */
  label: string;
  /** Its controls; an entry that is `false`, `null` or `undefined` is one left out. */
  items: readonly ReactNode[];
  /** The toggle group the group is, where its controls are toggles. */
  toggles?: ReactElement<Record<string, unknown>>;
  /**
   * Whether the group is named even when its list has one entry: an entry
   * that draws several controls of its own (a consumer's insert tools) is
   * one entry of the list.
   */
  named?: boolean;
}>;

/** Whether an entry of a group's list is a control, not one left out. */
const isDrawn = (item: ReactNode): boolean =>
  item !== false && item !== null && item !== undefined;

/**
 * The parts of the toolbar's line, in order, and the rules among them: the
 * boxes the line lays out, through the elements that take no box of their
 * own (a group's) and past those it does not lay out (hidden, or placed out
 * of the line, such as a menu's focus guards).
 */
function readLine(line: Element) {
  const parts: ToolbarLinePart[] = [];
  const rules: HTMLElement[] = [];
  const controls: Element[] = [];
  const walk = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (
        child instanceof HTMLElement &&
        child.hasAttribute('data-toolbar-divider')
      ) {
        parts.push({ kind: 'rule' });
        rules.push(child);
        continue;
      }
      const { display, position } = getComputedStyle(child);
      if (display === 'contents') walk(child);
      else if (
        display !== 'none' &&
        position !== 'absolute' &&
        position !== 'fixed'
      ) {
        parts.push({
          kind: 'control',
          width: child.getBoundingClientRect().width,
        });
        controls.push(child);
      }
    }
  };
  walk(line);
  return { parts, rules, controls };
}

/**
 * Keeps each rule of the toolbar's line in its place (`data-place`, see
 * `placeToolbarRules`) as the bar and its controls change width, and as
 * controls come and go. Returns the ref for the line, and the ref for an
 * element as wide as the bar but with no height, whose width is watched:
 * watching the line itself would see its height change with the places this
 * gives the rules.
 */
function useToolbarLines() {
  const [line, setLine] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    if (line === null || width === null) return undefined;
    if (typeof ResizeObserver === 'undefined') return undefined;

    const layOut = () => {
      const lineWidth = line.getBoundingClientRect().width;
      // A bar that is not shown has no lines to lay out.
      if (lineWidth === 0) return;
      const { parts, rules } = readLine(line);
      const [rule] = rules;
      if (rule === undefined) return;
      const ruleWidth = Number.parseFloat(getComputedStyle(rule).minWidth);
      const places = placeToolbarRules(parts, lineWidth, ruleWidth);
      for (const [index, element] of rules.entries()) {
        const place = places[index];
        if (place !== undefined && element.dataset.place !== place) {
          element.dataset.place = place;
        }
      }
    };

    const resized = new ResizeObserver(layOut);
    const watch = () => {
      resized.disconnect();
      resized.observe(width);
      for (const control of readLine(line).controls) resized.observe(control);
    };
    const changed = new MutationObserver(() => {
      watch();
      layOut();
    });
    changed.observe(line, { childList: true, subtree: true });
    watch();
    layOut();
    return () => {
      resized.disconnect();
      changed.disconnect();
    };
  }, [line, width]);

  return [setLine, setWidth] as const;
}

/**
 * The field's toolbar: its groups in the order given, each with the controls
 * it has to offer. A group with nothing to offer is not drawn, and a toolbar
 * with no group is not drawn at all. `unavailable` is whether the field can be
 * edited at all (see `FieldUnavailableContext`).
 */
export function EditorToolbar({
  groups,
  unavailable,
}: Readonly<{ groups: readonly ToolbarGroup[]; unavailable: boolean }>) {
  const drawnGroups = groups.flatMap((group) => {
    const items = group.items.filter(isDrawn);
    return items.length === 0 ? [] : [{ ...group, items }];
  });
  const [setLineElement, setWidthElement] = useToolbarLines();
  if (drawnGroups.length === 0) return null;

  return (
    <FieldUnavailableContext.Provider value={unavailable}>
      {/*
        The toolbar's bar. It is the element with the toolbar's role, which is
        what a host that restyles the bar selects (the translation table's
        cell does).
      */}
      <Toolbar.Root className="bg-surface-1 text-surface-1-contrast publish-colors order-1 w-full self-stretch border-b border-current/10 px-6 py-2">
        {/*
          The toolbar is one line of controls that wraps, a control at a time,
          where the field is narrower than they are together: the field clips
          what overflows it, so a toolbar kept to one line would put its last
          controls out of reach. A group breaks across lines like any other
          part of the line, so no line is left short by a group that would not
          fit whole.

          The controls sit next to each other. Before each group is a space
          with a rule in it, which separates the group from the one before.
          Where a group does not fit at the end of a line, its rule is not
          drawn and ends the line instead (see `useToolbarLines`), so a line
          never starts with a rule, or ends with one, and starts at the bar's
          edge. The box leaves room for the ring of a focused control
          (`focus-styles`) and cuts off a control wider than the bar.
        */}
        <div className="relative -mx-[5px] overflow-x-clip px-[5px]">
          <span
            ref={setWidthElement}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-0"
          />
          <div ref={setLineElement} className="flex flex-wrap items-center">
            {drawnGroups.map(({ key, label, items, toggles, named }) => {
              const drawn = [
                <span
                  key="divider"
                  aria-hidden
                  data-toolbar-divider=""
                  className="flex w-3 min-w-3 shrink-0 justify-center data-[place=lineEnd]:h-0 data-[place=lineEnd]:basis-full data-[place=lineEnd]:*:hidden"
                >
                  <span className="h-5 w-px bg-current/20" />
                </span>,
                ...items.map((item, index) => (
                  <Fragment key={isValidElement(item) ? item.key : index}>
                    {item}
                  </Fragment>
                )),
              ];
              // A group of one names nothing its one control does not,
              // unless it is what makes that control a toggle, or its one
              // entry draws several controls.
              if (items.length === 1 && toggles === undefined && !named) {
                return <Fragment key={key}>{drawn}</Fragment>;
              }
              return (
                <Toolbar.Group
                  key={key}
                  lang="en"
                  aria-label={label}
                  // The group's own element takes no box: its controls are
                  // the line's.
                  className="contents"
                  {...(toggles !== undefined && { render: toggles })}
                >
                  {drawn}
                </Toolbar.Group>
              );
            })}
          </div>
        </div>
      </Toolbar.Root>
    </FieldUnavailableContext.Provider>
  );
}
