import type { Decorator } from '@storybook/react-vite';

const DIRECTION_KEY = 'direction';

const directions = {
  ltr: { name: 'LTR' },
  rtl: { name: 'RTL' },
} as const;

type DirectionKey = keyof typeof directions;

/**
 * Wraps the story in a region of the selected writing direction so every
 * component can be inspected in RTL without an RTL locale shipping.
 *
 * `dir` goes on a wrapper element rather than on `<html>`: the story canvas
 * itself (and the panels around it) must stay LTR, and a nested region is
 * also how a real host scopes direction to a content area. Components that
 * lay out with logical properties follow it; anything still using `ml-*`,
 * `pl-*`, `left-*` or `text-left` visibly does not.
 */
export const withDirection: Decorator = (Story, context) => {
  const direction =
    (context.globals[DIRECTION_KEY] as DirectionKey | undefined) ?? 'ltr';

  return (
    <div dir={direction} className="contents">
      <Story />
    </div>
  );
};

export const directionGlobalTypes = {
  [DIRECTION_KEY]: {
    name: 'Direction',
    description: 'Writing direction applied around the story',
    defaultValue: 'ltr',
    toolbar: {
      icon: 'transfer' as const,
      items: Object.entries(directions).map(([key, { name }]) => ({
        value: key,
        title: name,
      })),
      showName: true,
      dynamicTitle: true,
    },
  },
};
