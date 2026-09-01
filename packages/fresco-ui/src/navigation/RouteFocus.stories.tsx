import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Button from '../Button';
import RouteFocus, { routeFocusTargetProps } from './RouteFocus';

const TIMELINE = '/protocol/timeline';
const CODEBOOK = '/protocol/codebook';

const routeTitle = (location: string) =>
  location === CODEBOOK ? 'Codebook' : 'Timeline';

type RouteDemoProps = {
  initialLocation: string;
  /**
   * Where the control that changes the route lives, which is the whole
   * difference between the two stories: an in-content control is unmounted by
   * the route it navigates to (focus is lost, so the landing point takes it),
   * a persistent one survives the navigation (it still owns focus, so it is
   * left alone).
   */
  navigation: 'in-content' | 'persistent';
};

/**
 * Stands in for a host router. `RouteFocus` takes the location as a prop, so a
 * state update here is a route change as far as it is concerned.
 */
const RouteDemo = ({ initialLocation, navigation }: RouteDemoProps) => {
  const [location, setLocation] = useState(initialLocation);
  const elsewhere = location === CODEBOOK ? TIMELINE : CODEBOOK;

  const goElsewhere = (
    <Button size="sm" onClick={() => setLocation(elsewhere)}>
      {`Open ${routeTitle(elsewhere)}`}
    </Button>
  );

  return (
    <div className="flex flex-col items-start gap-4">
      <RouteFocus location={location} />
      {navigation === 'persistent' && goElsewhere}
      {/*
        The route's own content. Keyed by location so a route change replaces
        it wholesale, exactly as a router does — which is what makes an
        in-content control disappear under the researcher who just used it.
      */}
      <div key={location} className="flex flex-col items-start gap-4">
        <h1
          {...routeFocusTargetProps}
          className="font-heading text-3xl font-bold"
        >
          {routeTitle(location)}
        </h1>
        <p className="text-base">
          Showing {location}. The destination is announced on every change;
          focus moves only when the change left nothing focused.
        </p>
        {navigation === 'in-content' && goElsewhere}
      </div>
    </div>
  );
};

const documentation = `
Route-change focus and announcement, mounted once above the host's router.

\`\`\`tsx
const [location] = useLocation(); // whatever your router calls it

<RouteFocus location={location} />
\`\`\`

Spread \`routeFocusTargetProps\` onto each route's \`<h1>\` to name the landing
point, and call \`focusRouteTarget()\` directly in the rarer case where a
route's content is replaced without the location changing.

- **The destination is announced on every route change**, in a polite live
  region, because a screen-reader user gets no other signal that the page
  changed.
- **Focus moves only when the route change LOST focus.** Any other owner — a
  dialog returning focus to its opener, an autofocused field, a focus trap — is
  left alone, so this cannot fight them.
- **A landing point inside \`[inert]\` is refused.** Focusing an inert element
  silently fails and leaves focus on \`<body>\`, which is worse than not trying.

The component takes the location as a prop rather than calling a router hook,
so it works with any router.
`;

const meta = {
  title: 'Navigation/RouteFocus',
  component: RouteFocus,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: documentation } },
  },
  args: {
    location: TIMELINE,
  },
} satisfies Meta<typeof RouteFocus>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The link the researcher used is part of the route it navigates away from, so
 * activating it drops focus to `<body>` — the case this component exists for.
 * Focus lands on the new route's heading, and the destination is announced.
 */
export const LandsOnTheHeadingWhenFocusIsLost: Story = {
  render: ({ location }) => (
    <RouteDemo initialLocation={location} navigation="in-content" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole('button', { name: 'Open Codebook' }),
    );

    const heading = canvas.getByRole('heading', {
      level: 1,
      name: 'Codebook',
    });
    await waitFor(() => expect(heading).toHaveFocus());
    await expect(canvas.getByRole('status')).toHaveTextContent('Codebook');
  },
};

/**
 * The same navigation from a control that survives it. The control still owns
 * focus after the route changes, so focus is left exactly where the researcher
 * put it — the announcement still happens, because the page still changed.
 */
export const LeavesAnotherFocusOwnerAlone: Story = {
  render: ({ location }) => (
    <RouteDemo initialLocation={location} navigation="persistent" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const navigate = canvas.getByRole('button', { name: 'Open Codebook' });

    await userEvent.click(navigate);

    await waitFor(() =>
      expect(canvas.getByRole('status')).toHaveTextContent('Codebook'),
    );
    await expect(
      canvas.getByRole('button', { name: 'Open Timeline' }),
    ).toHaveFocus();
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Codebook' }),
    ).not.toHaveFocus();
  },
};
