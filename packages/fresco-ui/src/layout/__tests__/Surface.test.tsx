import { render } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Surface from '../Surface';

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

  it('clamps depths beyond the token scale to level 3 and warns', () => {
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
    expect(getSurface('s4').className).toContain('bg-surface-3');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('Surface');
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

  it('restarts the depth ladder for its children', () => {
    render(
      <Surface>
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
  });
});
