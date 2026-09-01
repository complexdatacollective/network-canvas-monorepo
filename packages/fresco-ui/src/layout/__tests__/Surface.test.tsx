import { render } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Surface, { MotionSurface, SurfaceDepthReset } from '../Surface';

const getSurface = (id: string) => {
  const element = document.querySelector(`[data-testid="${id}"]`);
  if (!(element instanceof HTMLElement))
    throw new Error(`Surface "${id}" not found`);
  return element;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Surface depth derivation', () => {
  it('renders the base surface tokens at the top level', () => {
    render(<Surface data-testid="s0">content</Surface>);
    expect(getSurface('s0').className).toContain('bg-surface');
    expect(getSurface('s0').className).not.toContain('bg-surface-1');
  });

  it('derives one step per nested Surface', () => {
    render(
      <Surface data-testid="s0">
        <Surface data-testid="s1">
          <Surface data-testid="s2">
            <Surface data-testid="s3" />
          </Surface>
        </Surface>
      </Surface>,
    );
    expect(getSurface('s1').className).toContain('bg-surface-1');
    expect(getSurface('s2').className).toContain('bg-surface-2');
    expect(getSurface('s3').className).toContain('bg-surface-3');
  });

  it('is unaffected by intermediate non-Surface elements', () => {
    render(
      <Surface data-testid="s0">
        <div>
          <section>
            <Surface data-testid="s1" />
          </section>
        </div>
      </Surface>,
    );
    expect(getSurface('s1').className).toContain('bg-surface-1');
  });

  it('exposes the derived depth as a CSS variable', () => {
    render(
      <Surface data-testid="s0">
        <Surface data-testid="s1" />
      </Surface>,
    );
    expect(getSurface('s0').className).toContain('[--surface-depth:0]');
    expect(getSurface('s1').className).toContain('[--surface-depth:1]');
  });

  it('renders the deepest token level without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <Surface>
        <Surface>
          <Surface>
            <Surface>
              <Surface data-testid="s4" />
            </Surface>
          </Surface>
        </Surface>
      </Surface>,
    );
    expect(getSurface('s4').className).toContain('bg-surface-4');
    expect(warn).not.toHaveBeenCalled();
  });

  it('clamps depths beyond the token scale to level 4 and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <Surface>
        <Surface>
          <Surface>
            <Surface>
              <Surface>
                <Surface data-testid="s5" />
              </Surface>
            </Surface>
          </Surface>
        </Surface>
      </Surface>,
    );
    expect(getSurface('s5').className).toContain('bg-surface-4');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('Surface');
  });

  it('derives through MotionSurface', () => {
    render(
      <MotionSurface data-testid="m0">
        <MotionSurface data-testid="m1" />
      </MotionSurface>,
    );
    expect(getSurface('m0').className).toContain('bg-surface');
    expect(getSurface('m1').className).toContain('bg-surface-1');
  });

  it('renders as a custom element without a container when noContainer', () => {
    const { container } = render(
      <ul>
        <Surface as="li" noContainer data-testid="item" />
      </ul>,
    );
    const item = getSurface('item');
    expect(item.tagName).toBe('LI');
    expect(item.parentElement).toBe(container.querySelector('ul'));
  });

  it('keeps component-tree depth for portalled children', () => {
    const PortalledSurface = () =>
      createPortal(<Surface data-testid="portalled" />, document.body);
    render(
      <Surface>
        <Surface>
          <PortalledSurface />
        </Surface>
      </Surface>,
    );
    expect(getSurface('portalled').className).toContain('bg-surface-2');
  });

  it('starts a named series at depth 0 and inherits it through descendants', () => {
    render(
      <Surface>
        <Surface>
          <Surface series="accent" data-testid="accent-0">
            <Surface data-testid="accent-1">
              <Surface data-testid="accent-2" />
            </Surface>
          </Surface>
        </Surface>
      </Surface>,
    );

    expect(getSurface('accent-0').className).toContain('bg-surface-accent');
    expect(getSurface('accent-0').className).toContain('[--surface-depth:0]');
    expect(getSurface('accent-1').className).toContain('bg-surface-accent-1');
    expect(getSurface('accent-1').className).toContain('[--surface-depth:1]');
    expect(getSurface('accent-2').className).toContain('bg-surface-accent-2');
  });

  it('can explicitly return from an accent series to the default series', () => {
    render(
      <Surface series="accent">
        <Surface>
          <Surface series="default" data-testid="default-0">
            <Surface data-testid="default-1" />
          </Surface>
        </Surface>
      </Surface>,
    );

    expect(getSurface('default-0').classList).toContain('bg-surface');
    expect(getSurface('default-0').classList).not.toContain(
      'bg-surface-accent',
    );
    expect(getSurface('default-1').classList).toContain('bg-surface-1');
  });
});

describe('floating Surface', () => {
  it('applies the popover tokens regardless of depth', () => {
    render(
      <Surface>
        <Surface>
          <Surface data-testid="float" floating />
        </Surface>
      </Surface>,
    );
    const className = getSurface('float').className;
    expect(className).toContain('bg-surface-popover');
    expect(className).toContain('text-surface-popover-contrast');
    expect(className).not.toContain('bg-surface-2');
  });

  it('does not warn when floating sits beyond the token scale', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <Surface>
        <Surface>
          <Surface>
            <Surface>
              <Surface>
                <Surface floating data-testid="deep-float" />
              </Surface>
            </Surface>
          </Surface>
        </Surface>
      </Surface>,
    );
    // The only depth-5 Surface is the floating one, which must not warn.
    expect(warn).not.toHaveBeenCalled();
    expect(getSurface('deep-float').className).toContain('bg-surface-popover');
  });

  it('restarts the depth ladder for its children', () => {
    render(
      <Surface series="accent">
        <Surface>
          <Surface>
            <Surface floating>
              <Surface data-testid="inner">
                <Surface data-testid="deeper" />
              </Surface>
            </Surface>
          </Surface>
        </Surface>
      </Surface>,
    );
    expect(getSurface('inner').className).toContain('bg-surface-1');
    expect(getSurface('deeper').className).toContain('bg-surface-2');
    expect(getSurface('inner').className).not.toContain('surface-accent');
  });
});

describe('SurfaceDepthReset', () => {
  it('restarts the ladder at the floating base for class-styled overlays', () => {
    render(
      <Surface series="accent">
        <Surface>
          <Surface>
            <SurfaceDepthReset>
              <Surface data-testid="reset-child" />
            </SurfaceDepthReset>
          </Surface>
        </Surface>
      </Surface>,
    );
    // Direct children derive depth 1, exactly as inside <Surface floating> —
    // a depth-0 child would render --surface against --surface-popover, which
    // are near-identical in the default theme.
    expect(getSurface('reset-child').className).toContain('bg-surface-1');
    expect(getSurface('reset-child').className).not.toContain('surface-accent');
  });
});
