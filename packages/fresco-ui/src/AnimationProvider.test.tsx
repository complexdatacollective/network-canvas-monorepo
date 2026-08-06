import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AnimationProvider } from './AnimationProvider';

describe('AnimationProvider', () => {
  afterEach(() => {
    globalThis.BASE_UI_ANIMATIONS_DISABLED = false;
  });

  it('disables Base UI before rendering descendants', () => {
    function AnimationState() {
      return <span>{String(globalThis.BASE_UI_ANIMATIONS_DISABLED)}</span>;
    }

    render(
      <AnimationProvider disableAnimations>
        <AnimationState />
      </AnimationProvider>,
    );

    expect(screen.getByText('true')).toBeTruthy();
  });

  it('does not disable Base UI by default', () => {
    globalThis.BASE_UI_ANIMATIONS_DISABLED = false;

    render(<AnimationProvider>content</AnimationProvider>);

    expect(globalThis.BASE_UI_ANIMATIONS_DISABLED).toBe(false);
  });
});
