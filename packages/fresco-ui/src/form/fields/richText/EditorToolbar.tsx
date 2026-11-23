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
} from 'react';

import { iconButtonVariants } from '../../../Button';

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

/** One group of the toolbar: what it is called, and the controls in it. */
export type ToolbarGroup = Readonly<{
  key: string;
  /** Read by a screen reader only, so English like the controls' own names. */
  label: string;
  /** Its controls; an entry that is `false`, `null` or `undefined` is one left out. */
  items: readonly ReactNode[];
  /** The toggle group the group is, where its controls are toggles. */
  toggles?: ReactElement<Record<string, unknown>>;
}>;

/** Whether an entry of a group's list is a control, not one left out. */
const isDrawn = (item: ReactNode): boolean =>
  item !== false && item !== null && item !== undefined;

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
          The toolbar is one line of controls that wraps where the field is
          narrower than they are together: the field clips what overflows it,
          so a toolbar kept to one line would put its last controls out of
          reach. A group breaks across lines like any other part of the line,
          so no line is left short by a group that would not fit whole.

          Every control is one piece with the space before it, and in that
          space the first control of a group has a rule. The line starts that
          much before the bar's edge (`-ms-3`), where this box cuts it off: the
          space before the first control of any line is not drawn, and so
          neither is a rule in it. A line never starts with a rule, or ends
          with one. The box leaves room for the ring of a focused control
          (`focus-styles`), which is narrower than the rule is far.
        */}
        <div className="-mx-[5px] overflow-x-clip px-[5px]">
          <div className="-ms-3 flex flex-wrap items-center gap-y-1">
            {drawnGroups.map(({ key, label, items, toggles }) => {
              const drawn = items.map((item, index) => (
                <span
                  key={isValidElement(item) ? item.key : index}
                  className="flex items-center"
                >
                  {/* As wide as the line starts before the bar's edge. */}
                  <span
                    aria-hidden
                    className="flex w-3 shrink-0 justify-center"
                  >
                    {index === 0 && <span className="h-5 w-px bg-current/20" />}
                  </span>
                  {item}
                </span>
              ));
              // A group of one names nothing its one control does not,
              // unless it is what makes that control a toggle.
              if (items.length === 1 && toggles === undefined) {
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
