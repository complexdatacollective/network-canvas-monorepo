import { Children, isValidElement, type ReactNode } from 'react';

import { cx } from '../utils/cva';

export type SwitcherLockupProps = {
  /**
   * One or two `EntitySwitcher`s, outermost first — team, then study.
   *
   * A conditional child is the right way to leave the second segment out:
   * `{study && <EntitySwitcher … />}` renders a lockup with one segment,
   * not one with an empty second.
   */
  children: ReactNode;
  /**
   * Merged onto the lockup's outer element — the one that carries the
   * container query, not the bordered box. This is where a host says how wide
   * the lockup may be (`flex-1`, `w-full`, `max-w-…`).
   */
  className?: string;
};

/**
 * Joins one or two `EntitySwitcher`s into a single bordered object that reads
 * as a path — team, then the study inside it.
 *
 * ```tsx
 * <SwitcherLockup>
 *   <EntitySwitcher kicker={t('team')} items={teams} … />
 *   {studyId !== undefined && (
 *     <EntitySwitcher kicker={t('study')} items={studies} … />
 *   )}
 * </SwitcherLockup>
 * ```
 *
 * **The study segment is absent, not empty.** With one child the lockup is
 * simply a single rounded control: nothing marks where a second segment would
 * have been, because outside a study there is no study, and a divider with a
 * blank beside it would say the opposite.
 *
 * **One border, one divider.** The segments share the lockup's border and are
 * separated by a rule, so the corners round only on the outer edges — the
 * pair reads as one object rather than two controls that happen to touch.
 * There is no `overflow-hidden` doing that clipping: it would take the focus
 * ring off whichever trigger is focused.
 *
 * **The lockup is the `@container`,** so its switchers collapse against the
 * width the lockup was given rather than against the viewport, and the same
 * pair behaves correctly in a wide app header and in a narrow panel without
 * either switcher knowing which it is in.
 *
 * That is why there are two elements here and not one. `container-type:
 * inline-size` applies inline-size containment, which makes an element's own
 * width ignore its contents — put it on the bordered box and the box measures
 * zero, its segments spill out of it, and every switcher inside reads a
 * container narrower than the collapse threshold and stays collapsed forever.
 * So the OUTER element carries the container and takes whatever width the host
 * gives it, and the INNER element is the bordered box, sized to its contents
 * as normal. The host does have to give the outer element a width it does not
 * derive from its contents: as a block-level child that is automatic, and in a
 * flex or grid row it means `flex-1`, `w-full`, or a sized track.
 */
export function SwitcherLockup({ children, className }: SwitcherLockupProps) {
  // `Children.toArray` drops `null`, `undefined` and booleans, so a
  // conditional second switcher leaves no segment behind — and it assigns
  // every survivor a key, which is what makes the divider land between the
  // segments that are actually rendered rather than between slots.
  const segments = Children.toArray(children).filter(
    (child) => isValidElement(child) || typeof child === 'string',
  );

  return (
    <div className={cx('@container min-w-0', className)}>
      <div className="border-outline inline-flex max-w-full min-w-0 items-stretch rounded-sm border">
        {segments.map((segment, index) => (
          <div
            key={isValidElement(segment) ? segment.key : index}
            className={cx(
              'flex min-w-0 items-center',
              index > 0 && 'border-outline border-s',
              /*
                The segment's own corners, pushed onto the control inside it.
                A switcher fills its segment and paints a surface when it is
                open, so its radius has to be the lockup's on the outer edges
                and square where it meets the divider — otherwise the open
                surface draws its own rounded rectangle inside a differently
                rounded box and spills over the border between them.

                Done by styling the child rather than by clipping here:
                `overflow-hidden` would take the focus ring off whichever
                trigger is focused, and the ring is drawn outside the element.
              */
              '[&>*]:rounded-none',
              index === 0 && '[&>*]:rounded-s-sm',
              index === segments.length - 1 && '[&>*]:rounded-e-sm',
            )}
          >
            {segment}
          </div>
        ))}
      </div>
    </div>
  );
}
