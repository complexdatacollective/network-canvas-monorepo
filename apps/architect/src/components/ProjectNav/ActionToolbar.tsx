import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Transition, Variants } from 'motion/react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { SegmentedToolbar } from '@codaco/fresco-ui/SegmentedToolbar';
import { cx } from '~/utils/cva';

export type ActionToolbarProps = {
  'children': ReactNode;
  'leadingActions'?: ReactNode;
  'className'?: string;
  'aria-label'?: string;
  'leadingAriaLabel'?: string;
};

type ToolbarRegistration = {
  owner: symbol;
  props: ActionToolbarProps;
};

type ActionToolbarRegistry = {
  register: (owner: symbol, props: ActionToolbarProps) => void;
  unregister: (owner: symbol) => void;
};

const ActionToolbarRegistryContext =
  createContext<ActionToolbarRegistry | null>(null);

type ActionToolbarProviderProps = {
  children: ReactNode;
};

/**
 * Owns the single toolbar surface used throughout the protocol workspace.
 * Route children publish their current controls through `useActionToolbar`,
 * but this host stays mounted while the route changes so SegmentedToolbar can
 * animate the old controls out and the new controls in together.
 */
export const ActionToolbarProvider = ({
  children,
}: ActionToolbarProviderProps) => {
  const [registration, setRegistration] = useState<ToolbarRegistration | null>(
    null,
  );

  const register = useCallback(
    (owner: symbol, props: ActionToolbarProps) =>
      setRegistration((current) =>
        current?.owner === owner && current.props === props
          ? current
          : { owner, props },
      ),
    [],
  );

  const unregister = useCallback((owner: symbol) => {
    setRegistration((current) => (current?.owner === owner ? null : current));
  }, []);

  const registry = useMemo(
    () => ({ register, unregister }),
    [register, unregister],
  );

  return (
    <ActionToolbarRegistryContext.Provider value={registry}>
      {children}
      <AnimatePresence>
        {registration ? (
          <ActionToolbar
            key="protocol-action-toolbar"
            {...registration.props}
          />
        ) : null}
      </AnimatePresence>
    </ActionToolbarRegistryContext.Provider>
  );
};

/**
 * Publishes route-local controls to the persistent protocol toolbar host.
 * The registration runs in a layout effect so a route hand-off completes
 * before paint and never flashes an empty or stale toolbar.
 */
export const useActionToolbar = (props: ActionToolbarProps) => {
  const registry = useContext(ActionToolbarRegistryContext);
  const owner = useRef(Symbol('action-toolbar-owner'));

  if (!registry) {
    throw new Error(
      'useActionToolbar must be used inside ActionToolbarProvider.',
    );
  }

  useLayoutEffect(() => {
    registry.register(owner.current, props);
  }, [props, registry]);

  useLayoutEffect(() => () => registry.unregister(owner.current), [registry]);
};

export const toolbarEnterExitMotion = {
  hidden: {
    opacity: 0,
    y: 'calc(100% + 1.25rem)',
  },
  visible: {
    opacity: 1,
    y: 0,
  },
} satisfies Variants;

export const toolbarEnterExitSpring = {
  type: 'spring',
  stiffness: 360,
  damping: 24,
  mass: 0.8,
} satisfies Transition;

/**
 * The toolbar surface itself. Deliberately module-private: it is `fixed`, and
 * two of them on one screen overlap. Every route publishes its controls through
 * `useActionToolbar` instead, and the provider above is the only thing that
 * renders this — so there is no second way to put a toolbar on screen for a
 * route to reach for.
 */
const ActionToolbar = ({
  children,
  leadingActions,
  className,
  'aria-label': ariaLabel = 'Page actions',
  leadingAriaLabel = 'History actions',
}: ActionToolbarProps) => {
  const hasLeadingActions = leadingActions !== undefined;
  const shouldReduceMotion = useReducedMotion() ?? false;
  const toolbarTransition = shouldReduceMotion
    ? { duration: 0 }
    : toolbarEnterExitSpring;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="hidden"
      variants={toolbarEnterExitMotion}
      transition={toolbarTransition}
      className="phone-landscape:px-6 pointer-events-none fixed inset-x-0 bottom-5 z-20 px-4 print:hidden"
    >
      <div className="mx-auto flex max-w-7xl min-w-0 items-end justify-between gap-2">
        <AnimatePresence>
          {hasLeadingActions ? (
            <motion.div
              key="history-toolbar"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={toolbarEnterExitMotion}
              transition={toolbarTransition}
              className="pointer-events-auto shrink-0 self-end"
            >
              <SegmentedToolbar aria-label={leadingAriaLabel} size="md">
                {leadingActions}
              </SegmentedToolbar>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <SegmentedToolbar
          aria-label={ariaLabel}
          size="md"
          className={cx(
            'pointer-events-auto ml-auto min-w-0 self-end',
            className,
          )}
        >
          {children}
        </SegmentedToolbar>
      </div>
    </motion.div>
  );
};
