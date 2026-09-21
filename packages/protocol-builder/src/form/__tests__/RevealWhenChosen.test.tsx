import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RevealWhenChosen from '../RevealWhenChosen.tsx';

type Box = Readonly<{ top: number; bottom: number }>;

const boxes = new Map<string, Box>();

const boxFor = (element: Element): Box => {
  const name =
    element.getAttribute('aria-label') ?? element.getAttribute('data-box');
  return (name === null ? undefined : boxes.get(name)) ?? { top: 0, bottom: 0 };
};

function Form({
  shown,
  chosenIn = 'control',
}: Readonly<{ shown: string | null; chosenIn?: string }>) {
  return (
    <div data-box="port" style={{ overflowY: 'auto' }}>
      <div data-field-name="control">
        <select aria-label="Control" defaultValue="a">
          <option value="a">A</option>
        </select>
      </div>
      <div data-field-name="other">
        <input aria-label="Other" />
      </div>
      <div data-field-name="picked">
        <button type="button" aria-label="Pick" aria-controls="pick-popup" />
      </div>
      <div id="pick-popup" role="listbox" aria-label="Picks">
        <div role="option" aria-selected="false" tabIndex={-1}>
          Pick
        </div>
      </div>
      {shown !== null && (
        <RevealWhenChosen chosenIn={chosenIn} revealKey={shown}>
          <section aria-label="Values" />
        </RevealWhenChosen>
      )}
    </div>
  );
}

const renderForm = () => {
  const view = render(<Form shown={null} />);
  const port = view.container.querySelector<HTMLElement>('[data-box="port"]');
  if (port === null) throw new Error('the form has no scrolling region');
  Object.defineProperty(port, 'scrollHeight', { value: 2000 });
  Object.defineProperty(port, 'clientHeight', { value: 500 });
  const scrollBy = vi.fn<(options?: ScrollToOptions) => void>();
  port.scrollBy = scrollBy as HTMLElement['scrollBy'];
  return { ...view, scrollBy };
};

const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = vi.fn((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }));
};

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  boxes.clear();
  boxes.set('port', { top: 100, bottom: 600 });
  boxes.set('Control', { top: 500, bottom: 548 });
  boxes.set('Other', { top: 560, bottom: 600 });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      const { top, bottom } = boxFor(this);
      return DOMRect.fromRect({ x: 0, y: top, width: 0, height: bottom - top });
    },
  );
  setReducedMotion(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.matchMedia = originalMatchMedia;
});

describe('what a choice reveals below it', () => {
  it('scrolls what appears into view while the control keeps focus', async () => {
    boxes.set('Values', { top: 700, bottom: 900 });
    const { rerender, scrollBy } = renderForm();

    const control = screen.getByRole('combobox', { name: 'Control' });
    control.focus();
    rerender(<Form shown="choice" />);

    await waitFor(() => {
      expect(scrollBy).toHaveBeenCalledWith({ top: 300, behavior: 'smooth' });
    });
    expect(control).toHaveFocus();
  });

  it('stops short of scrolling the control it was chosen in out of view', async () => {
    boxes.set('Values', { top: 700, bottom: 1600 });
    const { rerender, scrollBy } = renderForm();

    screen.getByRole('combobox', { name: 'Control' }).focus();
    rerender(<Form shown="choice" />);

    await waitFor(() => {
      expect(scrollBy).toHaveBeenCalledWith({ top: 376, behavior: 'smooth' });
    });
  });

  it('reveals again when the choice changes what is shown', async () => {
    boxes.set('Values', { top: 700, bottom: 900 });
    const { rerender, scrollBy } = renderForm();

    screen.getByRole('combobox', { name: 'Control' }).focus();
    rerender(<Form shown="choice" />);
    await waitFor(() => {
      expect(scrollBy).toHaveBeenCalledTimes(1);
    });
    rerender(<Form shown="boolean" />);

    await waitFor(() => {
      expect(scrollBy).toHaveBeenCalledTimes(2);
    });
  });

  it('counts a choice made in the popup a field opens as made in that field', async () => {
    boxes.set('Pick', { top: 500, bottom: 548 });
    boxes.set('Values', { top: 700, bottom: 900 });
    const { rerender, scrollBy } = renderForm();

    screen.getByRole('option', { name: 'Pick' }).focus();
    rerender(<Form shown="choice" chosenIn="picked" />);

    await waitFor(() => {
      expect(scrollBy).toHaveBeenCalledWith({ top: 300, behavior: 'smooth' });
    });
  });

  it('jumps rather than glides when motion is reduced', async () => {
    setReducedMotion(true);
    boxes.set('Values', { top: 700, bottom: 900 });
    const { rerender, scrollBy } = renderForm();

    screen.getByRole('combobox', { name: 'Control' }).focus();
    rerender(<Form shown="choice" />);

    await waitFor(() => {
      expect(scrollBy).toHaveBeenCalledWith({ top: 300, behavior: 'auto' });
    });
  });

  it('leaves the form where it is when focus is in another field', async () => {
    boxes.set('Values', { top: 700, bottom: 900 });
    const { rerender, scrollBy } = renderForm();

    screen.getByRole('textbox', { name: 'Other' }).focus();
    rerender(<Form shown="choice" />);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('leaves the form where it is when what appeared is already in view', async () => {
    boxes.set('Values', { top: 560, bottom: 590 });
    const { rerender, scrollBy } = renderForm();

    screen.getByRole('combobox', { name: 'Control' }).focus();
    rerender(<Form shown="choice" />);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(scrollBy).not.toHaveBeenCalled();
  });
});
