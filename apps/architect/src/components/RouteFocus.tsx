import { useLocation } from 'wouter';

import SharedRouteFocus from '@codaco/fresco-ui/navigation/RouteFocus';

export {
  focusRouteTarget,
  routeFocusTargetProps,
} from '@codaco/fresco-ui/navigation/RouteFocus';

/**
 * Architect's binding of fresco-ui's router-agnostic `RouteFocus` to wouter.
 *
 * The behaviour — what a route change lands focus on, when it declines to move
 * focus, and what it announces — lives in `@codaco/fresco-ui`, along with the
 * tests that pin it. This file exists for two reasons.
 *
 * The shared component takes the location as a prop, because a component
 * published for several hosts cannot call any one router's hook. Subscribing
 * here rather than in `Routes.tsx` keeps the re-render `useLocation` causes on
 * every navigation inside this leaf, instead of putting it above the `Switch`.
 *
 * And this module stays the single specifier Architect's call sites import:
 * `routeFocusTargetProps` on each route's landing heading, `focusRouteTarget`
 * in `ProtocolRouteGuard`, and the component itself in `Routes.tsx`. They are
 * unchanged by the move to fresco-ui, and the re-exports above are what keeps
 * them pointed at the shared implementation rather than a copy that can drift.
 */
const RouteFocus = () => {
  const [location] = useLocation();

  return <SharedRouteFocus location={location} />;
};

export default RouteFocus;
