import { Component, type ReactNode } from 'react';

import { ensureError } from '@codaco/shared-consts';
import { posthog } from '~/analytics';

/**
 * Keeps a scene that fails to load, such as a chunk gone after a deploy, to
 * its own step: the step shows its text without the illustration instead of
 * the error reaching the app's boundary and replacing the stage editor.
 */
export default class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    posthog.captureException(ensureError(error));
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
