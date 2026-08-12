const createMotionValue = (initialValue) => {
  let currentValue = initialValue;
  const subscribers = new Set();

  return {
    clearListeners: () => subscribers.clear(),
    destroy: () => subscribers.clear(),
    get: () => currentValue,
    getPrevious: () => currentValue,
    getVelocity: () => 0,
    isAnimating: () => false,
    on: (_eventName, callback) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    onChange: (callback) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    set: (nextValue) => {
      currentValue = nextValue;
      subscribers.forEach((callback) => callback(nextValue));
    },
    stop: () => undefined,
  };
};

const Presence = ({ children }) => children;

// The Classic applications use Framer Motion versions that predate
// MotionGlobalConfig.skipAnimations. Keep their real non-rendering exports,
// but replace animated elements and scheduling hooks with synchronous test
// equivalents so presence changes take effect immediately in jsdom.
globalThis.vi.mock('framer-motion', async (importOriginal) => {
  const React = await globalThis.vi.importActual('react');
  const original = await importOriginal();

  const filterMotionProps = (props) =>
    Object.fromEntries(
      Object.entries(props).filter(
        ([key]) => key === 'style' || !original.isValidMotionProp(key),
      ),
    );

  const motionComponentCache = new Map();
  const createMotionComponent = (component) => {
    if (motionComponentCache.has(component)) {
      return motionComponentCache.get(component);
    }

    const MotionComponent = React.forwardRef(({ children, ...props }, ref) =>
      React.createElement(
        component,
        { ...filterMotionProps(props), ref },
        children,
      ),
    );
    MotionComponent.displayName =
      typeof component === 'string'
        ? `motion.${component}`
        : `motion(${component.displayName || component.name || 'Component'})`;
    motionComponentCache.set(component, MotionComponent);
    return MotionComponent;
  };

  const motionFactory = (component) => createMotionComponent(component);
  const motion = new Proxy(motionFactory, {
    apply: (_target, _thisArg, [component]) => createMotionComponent(component),
    get: (_target, property) => {
      if (property === 'custom') {
        return createMotionComponent;
      }
      if (typeof property === 'string') {
        return createMotionComponent(property);
      }
      return undefined;
    },
  });

  const useMotionValue = (initialValue) => {
    const value = React.useRef();
    if (value.current === undefined) {
      value.current = createMotionValue(initialValue);
    }
    return value.current;
  };

  const useAnimation = () =>
    React.useMemo(
      () => ({
        mount: () => () => undefined,
        set: () => undefined,
        start: () => Promise.resolve(),
        stop: () => undefined,
      }),
      [],
    );

  return {
    ...original,
    AnimatePresence: Presence,
    AnimateSharedLayout: Presence,
    m: motion,
    motion,
    useAnimation,
    useElementScroll: () => ({
      scrollX: useMotionValue(0),
      scrollXProgress: useMotionValue(0),
      scrollY: useMotionValue(0),
      scrollYProgress: useMotionValue(0),
    }),
    useMotionValue,
    useReducedMotion: () => true,
    useSpring: (initialValue) =>
      useMotionValue(initialValue?.get?.() ?? initialValue),
  };
});
