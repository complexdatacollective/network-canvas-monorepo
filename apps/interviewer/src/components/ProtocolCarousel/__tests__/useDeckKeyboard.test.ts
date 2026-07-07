import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDeckKeyboard } from '../useDeckKeyboard';

function pressOnWindow(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('useDeckKeyboard', () => {
  it('steps on arrow keys and activates on Enter', () => {
    const onStep = vi.fn();
    const onActivate = vi.fn();
    renderHook(() => useDeckKeyboard({ enabled: true, onStep, onActivate }));

    pressOnWindow('ArrowLeft');
    expect(onStep).toHaveBeenCalledWith(-1);
    pressOnWindow('ArrowRight');
    expect(onStep).toHaveBeenCalledWith(1);
    pressOnWindow('Enter');
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    const onStep = vi.fn();
    const onActivate = vi.fn();
    renderHook(() => useDeckKeyboard({ enabled: false, onStep, onActivate }));

    pressOnWindow('ArrowRight');
    pressOnWindow('Enter');
    expect(onStep).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('ignores keys originating from editable targets', () => {
    const onStep = vi.fn();
    const onActivate = vi.fn();
    renderHook(() => useDeckKeyboard({ enabled: true, onStep, onActivate }));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    input.remove();

    expect(onStep).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('ignores Enter from interactive targets but still steps arrows', () => {
    const onStep = vi.fn();
    const onActivate = vi.fn();
    renderHook(() => useDeckKeyboard({ enabled: true, onStep, onActivate }));

    const button = document.createElement('button');
    document.body.appendChild(button);
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    button.remove();

    expect(onActivate).not.toHaveBeenCalled();
    expect(onStep).toHaveBeenCalledWith(1);
  });
});
