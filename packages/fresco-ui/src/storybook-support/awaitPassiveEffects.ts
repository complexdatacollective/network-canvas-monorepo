/**
 * Resolves once React has flushed the passive effects of the commit that
 * rendered the story.
 *
 * Storybook starts a play function from a microtask as soon as the story has
 * committed, but React runs `useEffect` callbacks in a scheduler task queued
 * during that commit. Anything a component wires up in an effect is therefore
 * not in place yet when the first line of the play runs. Base UI attaches a
 * tooltip trigger's `mouseenter` listener that way and starts with hover
 * blocked until that listener has fired, so a `userEvent.hover` dispatched at
 * the top of a play arrives about 2ms too early, is swallowed, and nothing
 * re-fires it: the tooltip never opens. Playwright-driven pointer input (the
 * `test:storybook` project) takes long enough to cross the gap by accident;
 * Chromatic's JS-dispatched events do not.
 *
 * A zero-delay timeout is a macrotask registered after React's scheduler
 * message, so it runs once the effects have flushed. Await it before the
 * first synthetic interaction of a play. It is a precondition, not an
 * oracle: the assertions that follow still fail when the component is broken.
 */
export const awaitPassiveEffects = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
