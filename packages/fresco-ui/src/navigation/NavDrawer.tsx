'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { useReducedMotion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import CloseButton from '../CloseButton';
import Modal from '../Modal';
import ModalPopup from '../Modal/ModalPopup';
import { headingVariants } from '../typography/Heading';
import { cx } from '../utils/cva';
import { focusRouteTarget, hasRouteFocusTarget } from './RouteFocus';

/**
 * The drawer's slide.
 *
 * Deliberately NOT a spring, and not the shared `spring-medium` preset this
 * first used. Those presets suit small controls that pop; a full-height 320px
 * panel carrying an `elevation-high` shadow overshoots visibly at that
 * preset's bounce, and the settle reads as jank rather than as life — the
 * shadow repainting through the overshoot makes it worse.
 *
 * A drawer is a surface being pushed into place: it decelerates into rest and
 * stops. Short, transform only, no overshoot.
 */
const DRAWER_TRANSITION = {
  duration: 0.22,
  ease: [0.32, 0.72, 0, 1],
} as const;

/**
 * How far off-screen the closed panel sits, as a share of its own width.
 *
 * A transform has no logical form — `x` is the physical axis in every writing
 * direction — while the panel's PLACEMENT is logical (`inset-s-0` puts it on
 * the inline-start edge, which is the right-hand edge in RTL). Left as a plain
 * `-100%` the panel would settle on the correct edge but arrive from the wrong
 * side of the screen.
 *
 * So the offset is a custom property the `rtl:` variant flips, and the motion
 * targets below read it with `var()`. Both halves resolve it: the browser
 * resolves it natively in the `initial` transform Motion writes as inline
 * style, and Motion resolves it from the element's computed style when it
 * builds the keyframes (`DOMKeyframesResolver` samples CSS variable tokens).
 * Nothing has to know the direction in JavaScript.
 */
const CLOSED_OFFSET = 'var(--nav-drawer-closed-offset)';

export type NavDrawerProps = {
  /** Whether the drawer is showing. Controlled: the area owns this state. */
  open: boolean;
  /**
   * Asked to open or close. The drawer calls this with `false` itself when a
   * navigation commits (see `location`) as well as on every dismissal.
   */
  onOpenChange: (open: boolean) => void;
  /**
   * The host router's CURRENT, COMMITTED location. Router-agnostic on purpose,
   * exactly as `RouteFocus` takes it: every router spells its location hook
   * differently, and a shared component that called one would bind fresco-ui to
   * that router.
   *
   * A change to this string is what "the navigation the drawer initiated has
   * committed" means here, and it is the whole mechanism behind the rule that
   * a drawer must not outlive its own navigation. A navigation that is blocked
   * or cancelled never changes the committed location, so the drawer correctly
   * stays open for it.
   */
  location: string;
  /**
   * The navigation region's name, as one whole translated string — the same
   * name the area's wide-container `<nav>` carries. It names the dialog, names
   * the `<nav>` inside it, and is shown as the drawer's title.
   */
  label: string;
  /** The close control's whole translated label ("Close study navigation"). */
  closeLabel: string;
  /** The region's destinations — a `NavList`. */
  children: ReactNode;
  /** Merged onto the drawer panel. */
  className?: string;
};

/**
 * The panel's contents, and the half of the focus handoff that has to run when
 * the popup is GONE.
 *
 * Split into its own component for exactly that: it lives inside the popup, so
 * React tears it down when `AnimatePresence` finishes the exit animation, and
 * its effect cleanup is the one place in the drawer that can observe that
 * moment. A cleanup on `NavDrawer` itself would never fire — `NavDrawer` stays
 * mounted for the life of the area.
 *
 * Waiting for the unmount is what makes the handoff possible at all, rather
 * than a detail of it. `focusRouteTarget` moves focus only when the view change
 * LOST it, and the activated link goes on holding focus for as long as it is in
 * the document; by the time this cleanup runs the panel has been detached and
 * focus has fallen to `<body>`, which is the state the handoff is defined for.
 */
const NavDrawerPanel = ({
  label,
  labelId,
  closeLabel,
  wasNavigationClose,
  children,
}: {
  label: string;
  labelId: string;
  closeLabel: string;
  /**
   * Whether the close now in progress was driven by a navigation. Asked as a
   * question rather than handed over as a value, because the answer is not
   * known until the close happens — this component is mounted for the whole
   * time the drawer is open.
   */
  wasNavigationClose: () => boolean;
  children: ReactNode;
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Captured while the panel is still in a document, because the cleanup
    // runs after it has left one. The panel's own document rather than the
    // ambient `document`: fresco-ui renders into popped-out windows and
    // iframes, where the ambient one is a different page entirely.
    const ownerDocument = panelRef.current?.ownerDocument;

    return () => {
      if (!ownerDocument) return;
      if (!wasNavigationClose()) return;

      focusRouteTarget(ownerDocument);
    };
  }, [wasNavigationClose]);

  return (
    <div
      ref={panelRef}
      className="publish-colors bg-surface text-surface-contrast flex min-h-0 w-full flex-col"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-2">
        {/*
          A styled span, not a heading element, for the reason `NavList` gives
          for its group headings: this is chrome, and a heading here would be
          the first entry in the heading rotor for the whole drawer, ahead of
          nothing. The dialog takes its accessible name from `aria-label` on the
          popup and the navigation landmark takes its own from this element, so
          the name reaches assistive technology twice over without the string
          being written twice.
        */}
        <span
          id={labelId}
          className={headingVariants({ level: 'h4', margin: 'none' })}
        >
          {label}
        </span>
        <BaseDialog.Close
          render={<CloseButton title={closeLabel} size="sm" />}
        />
      </div>
      <nav
        aria-labelledby={labelId}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-4"
      >
        {children}
      </nav>
    </div>
  );
};

/**
 * The narrow-container presentation of a navigation region: the region's
 * `NavList` in a modal drawer, with the area's own name and a close control.
 *
 * ```tsx
 * <NavDrawer
 *   open={open}
 *   onOpenChange={setOpen}
 *   location={useRouterState({ select: (s) => s.location.pathname })}
 *   label={t('studyNavigation')}
 *   closeLabel={t('closeStudyNavigation')}
 * >
 *   <NavList>…</NavList>
 * </NavDrawer>
 * ```
 *
 * Built on `@codaco/fresco-ui/Modal` rather than a bare Base UI `Dialog.Root`,
 * because `Modal`'s `inertOthers` sweep is what genuinely inerts the page
 * behind it: Base UI's own focus manager marks the outside with `aria-hidden`
 * only, which hides it from assistive technology while leaving every control
 * out there reachable with Tab.
 *
 * **It closes on the navigation it initiated, and only when that navigation
 * commits.** Leaving it open across a commit would be worse than silent:
 * `RouteFocus` would refuse to move focus (the activated link still holds it,
 * and the destination heading sits inside the inerted subtree) while the
 * announcer — exempt from the inert sweep as an `[aria-live]` region — would
 * still announce a destination that is out of the accessibility tree and
 * untabbable.
 *
 * **The two closes move focus differently, and both are deliberate.**
 *
 * - *Dismissed* (Escape, the backdrop, the close control): focus returns to the
 *   control that opened the drawer, which is what `Modal` remembers and what
 *   `ModalPopup` falls back to when `finalFocus` has no opinion.
 * - *Navigated*: `finalFocus` answers `false`, suppressing that restore, and
 *   the exported `focusRouteTarget()` is called once the popup has unmounted.
 *   Returning to the trigger would be wrong twice over — the researcher asked
 *   to go somewhere, and the trigger belongs to an area bar the destination may
 *   not even render. The call waits for the unmount rather than for the close
 *   because focus is still inside the popup until then; `Modal` releases its
 *   isolation on `open` flipping, so the destination is out of `[inert]` well
 *   before this runs.
 */
const NavDrawer = ({
  open,
  onOpenChange,
  location,
  label,
  closeLabel,
  children,
  className,
}: NavDrawerProps) => {
  const shouldReduceMotion = useReducedMotion();
  const labelId = useId();

  /**
   * Which of the two closes is in progress. Read by `finalFocus` and by the
   * panel's unmount cleanup, which Base UI and React may run in either order —
   * so it is cleared when the drawer next OPENS rather than by whichever of
   * them runs first.
   */
  const closedByNavigation = useRef(false);
  const lastLocation = useRef(location);

  // Stable, so the panel's effect is never torn down and re-run by a render of
  // this component — which for that effect would mean an unmount, and an
  // unmount is the signal it exists to read.
  const wasNavigationClose = useCallback(() => closedByNavigation.current, []);

  /**
   * Cleared during the render that OPENS the drawer, the same way `Modal`
   * captures its opener, and deliberately not from an effect. The panel is a
   * child, so its mount effect runs BEFORE any effect here — and under
   * `StrictMode` React immediately runs that effect's cleanup once as a
   * rehearsal. With the record still reading "navigated" from a previous close,
   * the rehearsal would perform the handoff against a drawer that is opening,
   * dragging focus to the route heading the moment the researcher opened the
   * navigation.
   */
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) closedByNavigation.current = false;
  }

  useEffect(() => {
    if (lastLocation.current === location) return;
    // Recorded even while closed, so the next open does not immediately close
    // itself over a navigation that happened without it.
    lastLocation.current = location;

    if (!open) return;

    closedByNavigation.current = true;
    onOpenChange(false);
  }, [location, open, onOpenChange]);

  const closedTarget = shouldReduceMotion
    ? { opacity: 0.99 }
    : { x: CLOSED_OFFSET, opacity: 0.99 };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalPopup
        aria-label={label}
        // Suppress Base UI's restore-to-trigger only when there is somewhere
        // to hand off to. Answering `false` unconditionally was a bug: a
        // destination whose heading does not spread `routeFocusTargetProps`
        // left `focusRouteTarget` with nothing to focus, so the restore was
        // suppressed and focus fell to `<body>` — the next Tab restarting at
        // the skip link, which is the failure this handoff exists to prevent.
        // Answering `null` there lets the trigger restore run instead, which
        // is never worse. Read against the ambient document: a mismatch is
        // possible only in a popped-out window, and there it answers `null`
        // and restores, which is the safe direction.
        finalFocus={() =>
          closedByNavigation.current && hasRouteFocusTarget() ? false : null
        }
        className={cx(
          // No background of its own: `elevation-*` shadows are blended from
          // the PARENT's published background, and an element that paints its
          // own breaks that. The panel inside carries the surface.
          'elevation-high fixed inset-y-0 inset-s-0 flex w-80 max-w-[85vw]',
          '[--nav-drawer-closed-offset:-100%] rtl:[--nav-drawer-closed-offset:100%]',
          className,
        )}
        // `opacity` is in every keyframe because Base UI detects the end of the
        // exit animation through it. The near-1 value keeps that true while
        // staying invisible, which is what leaves reduced motion with a drawer
        // that appears and disappears rather than one that fades.
        initial={closedTarget}
        animate={{ x: 0, opacity: 1 }}
        exit={closedTarget}
        transition={shouldReduceMotion ? { duration: 0 } : DRAWER_TRANSITION}
      >
        <NavDrawerPanel
          label={label}
          labelId={labelId}
          closeLabel={closeLabel}
          wasNavigationClose={wasNavigationClose}
        >
          {children}
        </NavDrawerPanel>
      </ModalPopup>
    </Modal>
  );
};

export default NavDrawer;
