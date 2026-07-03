'use client';

import { motion } from 'motion/react';
import {
  createContext,
  type ElementType,
  forwardRef,
  useContext,
  useEffect,
} from 'react';

import { compose, cva, cx, type VariantProps } from '../utils/cva';
import ResponsiveContainer, {
  type ResponsiveContainerProps,
} from './ResponsiveContainer';

export const surfaceSpacingVariants = cva({
  base: '',
  variants: {
    section: {
      header: 'pb-0!',
      content: 'py-0!',
      footer: 'pt-0!',
      container: '',
    },
    spacing: {
      none: '',
      xs: 'px-4 py-3',
      sm: 'px-6 py-4',
      md: 'px-8 py-6',
      lg: 'px-10 py-8',
      xl: 'px-12 py-10',
    },
  },
  defaultVariants: {
    spacing: 'md',
    section: 'container',
  },
});

export const surfaceVariants = compose(
  surfaceSpacingVariants,
  cva({
    // `overflow-clip` (not `overflow-hidden`) so Surface never becomes a
    // programmatic scroll container. `overflow-hidden` still allows
    // `scrollIntoView`/focus auto-scroll to move a descendant into view by
    // scrolling the Surface itself, which in dialogs pushes the header off
    // screen when content exceeds the clipped area.
    //
    // Padding (`spacing`) and shadow (`shadow`) are intentionally separate
    // axes: a Combobox popup wants compact padding but a heavy shadow when
    // stacked on top of another popover, and a floating bar wants subtle
    // padding with a strong shadow cue. Named `shadow` (not `elevation`) to
    // avoid clashing with the `elevation-*` Tailwind plugin utilities.
    base: 'publish-colors relative min-h-0 overflow-clip rounded',
    variants: {
      // `depth` is derived from nesting by the Surface component and is not
      // part of its public props; there is deliberately no default so that
      // class-level consumers (which only ever use `floating`) don't pick up
      // a surface background by accident.
      depth: {
        0: 'text-surface-contrast bg-surface [--surface-depth:0]',
        1: 'text-surface-1-contrast bg-surface-1 [--surface-depth:1]',
        2: 'text-surface-2-contrast bg-surface-2 [--surface-depth:2]',
        3: 'text-surface-3-contrast bg-surface-3 [--surface-depth:3]',
      },
      floating: {
        true: 'text-surface-popover-contrast bg-surface-popover border-2 [--surface-depth:0]',
      },
      shadow: {
        none: '',
        xs: 'shadow',
        sm: 'shadow-md',
        md: 'shadow-lg',
        lg: 'shadow-xl',
        xl: 'shadow-2xl',
      },
    },
    defaultVariants: {
      shadow: 'md',
    },
  }),
);

// `process.env.NODE_ENV` is replaced statically by consuming bundlers (the
// library-safe convention React itself uses); declared here because the web
// tsconfig deliberately excludes Node globals.
declare const process: { env: { NODE_ENV?: string } };

const MAX_SURFACE_DEPTH = 3;

const clampDepth = (depth: number): 0 | 1 | 2 | 3 => {
  if (depth <= 0) return 0;
  if (depth === 1) return 1;
  if (depth === 2) return 2;
  return 3;
};

const SurfaceDepthContext = createContext(0);

/**
 * Restarts the Surface depth ladder for a subtree, as if the subtree were
 * mounted directly inside a depth-0 surface. Used by floating chrome that
 * applies the popover surface treatment via classes rather than by rendering
 * a `<Surface floating>` (e.g. DialogPopup), so that Surfaces nested inside
 * it derive from the overlay base rather than from wherever the overlay was
 * triggered.
 */
export const SurfaceDepthReset = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <SurfaceDepthContext.Provider value={1}>
    {children}
  </SurfaceDepthContext.Provider>
);

export type SurfaceVariants = Omit<
  VariantProps<typeof surfaceVariants>,
  'depth'
>;

type SurfaceProps<T extends ElementType = 'div'> = {
  as?: T;
  noContainer?: boolean;
} & SurfaceVariants &
  ResponsiveContainerProps &
  Omit<
    React.ComponentPropsWithoutRef<T>,
    | keyof SurfaceVariants
    | keyof ResponsiveContainerProps
    | 'as'
    | 'noContainer'
  >;

/**
 * Surface is a layout component that provides a background and foreground color
 * and allows for spacing to be applied. It is intended to be used as a container
 * to construct hierarchical layouts, and is explicitly designed to support
 * being nested.
 *
 * The visual level is derived from nesting: each Surface renders one step
 * above the Surface it is mounted inside (via context, so portals keep their
 * component-tree position). Depths beyond the token scale clamp to the
 * deepest token and warn in development. `floating` applies the popover
 * treatment regardless of depth and restarts the ladder for its children.
 *
 * The derived depth is exposed to descendants as `--surface-depth`.
 *
 * To override the background color, use `bg-*` classes in className:
 * <Surface className="bg-primary text-primary-contrast">
 */
const SurfaceComponent = forwardRef<HTMLDivElement, SurfaceProps>(
  (
    {
      as,
      children,
      spacing,
      shadow,
      section,
      floating,
      className,
      maxWidth,
      baseSize,
      noContainer = false,
      ...rest
    },
    ref,
  ) => {
    const depth = useContext(SurfaceDepthContext);
    const renderedDepth = floating ? 0 : clampDepth(depth);

    useEffect(() => {
      // Consumer bundlers replace NODE_ENV, so the warning (and this whole
      // effect body) is dead-code-eliminated from production builds.
      if (
        process.env.NODE_ENV !== 'production' &&
        !floating &&
        depth > MAX_SURFACE_DEPTH
      ) {
        console.warn(
          `Surface: nested ${depth} levels deep, which exceeds the surface token scale (0–${MAX_SURFACE_DEPTH}). Rendering with the level-${MAX_SURFACE_DEPTH} tokens. Consider flattening the layout.`,
        );
      }
    }, [depth, floating]);

    const Component = as ?? 'div';
    const surfaceElement = (
      <Component
        ref={ref}
        {...rest}
        className={cx(
          surfaceVariants({
            depth: floating ? undefined : renderedDepth,
            floating,
            spacing,
            shadow,
            section,
          }),
          className,
        )}
      >
        <SurfaceDepthContext.Provider value={renderedDepth + 1}>
          {children}
        </SurfaceDepthContext.Provider>
      </Component>
    );

    if (noContainer) {
      return surfaceElement;
    }

    return (
      <ResponsiveContainer maxWidth={maxWidth} baseSize={baseSize}>
        {surfaceElement}
      </ResponsiveContainer>
    );
  },
);

SurfaceComponent.displayName = 'Surface';

const Surface = SurfaceComponent as <T extends ElementType = 'div'>(
  props: SurfaceProps<T> & { ref?: React.Ref<HTMLElement> },
) => React.ReactElement | null;

export default Surface;

export const MotionSurface = motion.create(Surface);
