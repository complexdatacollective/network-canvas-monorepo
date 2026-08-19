import { Dialog } from '@base-ui/react/dialog';
import {
  type HTMLMotionProps,
  LayoutGroup,
  motion,
  type TargetAndTransition,
  usePresence,
  type VariantLabels,
} from 'motion/react';
import { type ComponentProps, useEffect, useId, useRef } from 'react';

import { useSafeAnimate } from '../hooks/useSafeAnimate';
import {
  asFinalFocusTarget,
  isUsableFinalFocusTarget,
  normaliseFinalFocus,
  type FinalFocusCloseType,
  type FinalFocusResult,
} from '../utils/finalFocus';
import { useModalOpener } from './ModalOpener';

/**
 * Makes the opacity property required in TargetAndTransition.
 * Base-UI's dialog component detects animation completion via opacity changes.
 */
type TargetWithRequiredOpacity = TargetAndTransition & {
  opacity: number;
};

/**
 * Animation props with required opacity for Base-UI dialog detection.
 */
type AnimationPropsWithRequiredOpacity = {
  initial?: boolean | VariantLabels | TargetWithRequiredOpacity;
  animate?: TargetWithRequiredOpacity | VariantLabels;
  exit?: TargetWithRequiredOpacity | VariantLabels;
  transition?: HTMLMotionProps<'div'>['transition'];
};

type BaseModalPopupProps = Omit<
  ComponentProps<typeof motion.div>,
  'initial' | 'animate' | 'exit' | 'layoutId'
> &
  Omit<Dialog.Popup.Props, 'render'>;

/**
 * Props for ModalPopup.
 * Optionally provide animation props OR layoutId.
 * - If neither is provided, uses defaultPopupAnimation
 * - Animation props: initial/animate/exit (with required opacity when objects)
 * - layoutId: For shared layout animations (incompatible with animation props)
 */
type ModalPopupProps = BaseModalPopupProps &
  (
    | (AnimationPropsWithRequiredOpacity & { layoutId?: never })
    | {
        layoutId: string;
        initial?: never;
        animate?: never;
        exit?: never;
      }
  );

/**
 * A modal popup dialog using Base-UI's Dialog and motion for animations.
 * Uses defaultPopupAnimation when no animation props or layoutId is provided.
 * @see DialogPopup for a preset dialog style.
 * @see defaultPopupAnimation for default animation settings.
 *
 * @param children The content of the modal popup.
 * @param className Additional class names for styling.
 * @param initialFocus Where focus goes when the popup opens.
 * @param finalFocus Where focus RETURNS when the popup closes. Both are
 * forwarded to Base UI's `Dialog.Popup`, which hands them to its focus
 * manager. They used to be spread onto the `motion.div` render target with the
 * rest of `props`, which put them on a DOM element instead of on the focus
 * manager — so no dialog in the app could declare a focus-return target, and
 * every close fell back to Base UI's last resort. When `finalFocus` names
 * nothing usable, focus returns to the control the enclosing `Modal`
 * remembered as its opener; see `useModalOpener`.
 * @param props Animation props or layoutId, along with other Dialog.Popup props.
 */
export default function ModalPopup({
  children,
  className,
  style,
  initialFocus,
  finalFocus,
  ...props
}: ModalPopupProps) {
  const hasLayoutId = 'layoutId' in props && props.layoutId !== undefined;
  const hasCustomAnimation =
    'initial' in props || 'animate' in props || 'exit' in props;
  const usesDeclarativeAnimation = hasLayoutId || hasCustomAnimation;

  const id = useId();
  const openerRef = useModalOpener();

  // Determine animation: layoutId gets minimal opacity so that base-ui detects it,
  // custom props used as-is, otherwise default
  // Note: do NOT use a layout transition here, as child elements inherit it,
  // and it ends up looking bad.
  const animation = hasLayoutId
    ? ({
        initial: { opacity: 0.9999 },
        animate: { opacity: 1, transition: { when: 'beforeChildren' } },
        exit: { opacity: 0.9999, transition: { when: 'afterChildren' } },
      } as const)
    : {};

  const [scope, animate] = useSafeAnimate();

  const [isPresent, safeToRemove] = usePresence(!usesDeclarativeAnimation);

  /**
   * `usePresence`'s `safeToRemove` is a NEW function on every render of the
   * surrounding `AnimatePresence` (it closes over an `onExit` callback that
   * `AnimatePresence` re-creates each render, and `PresenceChild` clones its
   * context whenever `presenceAffectsLayout` is on). Depending on it in the
   * animation effect below would restart the exit animation on every ancestor
   * re-render — and an app that re-renders more often than the exit's ~0.3s
   * duration would then never reach `safeToRemove()`, leaving the popup
   * mounted (and animating) forever. Reading it through a ref keeps the effect
   * keyed on `isPresent` alone, so the exit runs exactly once.
   */
  const safeToRemoveRef = useRef(safeToRemove);
  safeToRemoveRef.current = safeToRemove;

  useEffect(() => {
    if (usesDeclarativeAnimation) {
      return;
    }

    if (isPresent) {
      const enterAnimation = async () => {
        await animate(
          scope.current,
          {
            opacity: [0, 1],
            y: ['-10%', '0%'],
            scale: [1.2, 1],
            filter: ['blur(10px)', 'blur(0px)'],
          },
          {
            when: 'beforeChildren',
            type: 'spring',
            stiffness: 500,
            damping: 30,
          },
        );
      };
      void enterAnimation();
    } else {
      const exitAnimation = async () => {
        await animate(scope.current, {
          opacity: [1, 0],
          y: ['0%', '-10%'],
          scale: [1, 1.5],
          filter: ['blur(0px)', 'blur(10px)'],
        });
        safeToRemoveRef.current?.();
      };

      void exitAnimation();
    }
  }, [isPresent, scope, animate, usesDeclarativeAnimation]);

  /**
   * Restores a rule that an explicit `finalFocus` silently switches off.
   *
   * Base UI only returns focus to its DEFAULT target if focus has not already
   * moved somewhere else in the meantime ("it likely entered a different
   * element which should be respected"). That check is skipped whenever
   * `finalFocus` is anything other than a boolean — so declaring a return
   * target, which is the whole point of this fix, would also make focus return
   * UNCONDITIONAL. A dialog that opens another dialog on its way out (picking
   * "create a new variable" opens the create-variable editor) would then yank
   * focus back out of the dialog that just took it.
   *
   * So: if something outside this popup already holds focus when it closes,
   * leave it alone. `false` is Base UI's "do not return focus at all"; `null`
   * would mean "use your default", which is exactly what must not happen here.
   */
  const guardedFinalFocus = (
    closeType: FinalFocusCloseType,
  ): FinalFocusResult => {
    const popupElement = scope.current;
    const ownerDocument = popupElement?.ownerDocument ?? document;
    const active = ownerDocument.activeElement;
    const boundary =
      popupElement?.closest('[data-base-ui-portal]') ?? popupElement;

    // A sibling portal that is NOT a dialog — a Select listbox, a Combobox, a
    // Popover, a Tooltip opened from inside this popup — is part of this
    // interaction, not somewhere focus has "moved on" to. Only another dialog,
    // or a control back on the page, counts as focus being claimed elsewhere.
    const activeDialog = active?.closest?.(
      '[role="dialog"], [role="alertdialog"]',
    );
    const heldByAnotherDialog =
      !!activeDialog && !boundary?.contains(activeDialog);
    const heldByThePage = !active?.closest?.('[data-base-ui-portal]');

    const focusHeldElsewhere =
      asFinalFocusTarget(active) !== null &&
      (heldByAnotherDialog || heldByThePage);

    if (focusHeldElsewhere) return false;

    const declared = normaliseFinalFocus(finalFocus, closeType);
    // `true`/`false` are instructions, not targets, so they pass straight
    // through.
    if (typeof declared === 'boolean') return declared;
    // A named element only wins if it can still be focused. The caller's target
    // is usually the control that opened the popup, and a confirmed destructive
    // action removes exactly that. An explicit target bypasses Base UI's own
    // connectivity check, so handing over a detached node leaves focus on
    // `<body>`: worse than falling through to the remembered opener (or to Base
    // UI's own default).
    if (declared !== null && isUsableFinalFocusTarget(declared)) {
      return declared;
    }

    // `null` from the caller means "no opinion", which is where the opener
    // remembered by the enclosing `Modal` comes in. Answering `null` in turn
    // asks Base UI for its own default, which is the behaviour a popup with no
    // opinion and no remembered opener has always had.
    const opener = openerRef?.current;
    return isUsableFinalFocusTarget(opener) ? opener : null;
  };

  const popup = (
    <Dialog.Popup
      initialFocus={initialFocus}
      finalFocus={guardedFinalFocus}
      // Must render motion.div to properly detect animation completion for Base-UI's Dialog
      render={
        <motion.div
          ref={scope}
          className={className}
          {...props}
          {...animation}
          style={style}
        />
      }
    >
      {children}
    </Dialog.Popup>
  );

  // When using layoutId for shared-element morph, we must NOT wrap in a
  // LayoutGroup with a unique id — that namespaces the layoutId and prevents
  // it from matching the trigger element rendered outside the popup.
  if (hasLayoutId) {
    return popup;
  }

  return <LayoutGroup id={id}>{popup}</LayoutGroup>;
}
