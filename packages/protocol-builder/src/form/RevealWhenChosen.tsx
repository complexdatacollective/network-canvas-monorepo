import { type ReactNode, useEffect, useRef } from 'react';

import { prefersReducedMotion } from './stageSections.ts';

type RevealWhenChosenProps = Readonly<{
  chosenIn: string;
  revealKey: string;
  children: ReactNode;
}>;

export default function RevealWhenChosen({
  chosenIn,
  revealKey,
  children,
}: RevealWhenChosenProps) {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const anchor = marker.current;
    if (anchor === null) return;
    const choice = controlChosenIn(anchor, chosenIn);
    if (choice === null) return;
    const frame = requestAnimationFrame(() => {
      const revealed = anchor.nextElementSibling;
      if (revealed !== null) revealBelow(choice, revealed);
    });
    return () => cancelAnimationFrame(frame);
  }, [chosenIn, revealKey]);

  return (
    <>
      <span ref={marker} hidden />
      {children}
    </>
  );
}

const CHOICE_MARGIN = 24;

function controlChosenIn(anchor: Element, fieldName: string): Element | null {
  const active = anchor.ownerDocument.activeElement;
  if (active === null) return null;
  if (
    active.closest('[data-field-name]')?.getAttribute('data-field-name') ===
    fieldName
  )
    return active;
  const scope = anchor.closest('form') ?? anchor.ownerDocument;
  const controls = scope.querySelectorAll(
    `[data-field-name="${CSS.escape(fieldName)}"] [aria-controls]`,
  );
  for (const control of controls) {
    const popup = anchor.ownerDocument.getElementById(
      control.getAttribute('aria-controls') ?? '',
    );
    if (popup?.contains(active)) return control;
  }
  return null;
}

function scrollingAncestor(element: Element): Element | null {
  for (
    let current = element.parentElement;
    current !== null;
    current = current.parentElement
  ) {
    const { overflowY } = getComputedStyle(current);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      current.scrollHeight > current.clientHeight
    )
      return current;
  }
  return null;
}

function revealBelow(choice: Element, revealed: Element): void {
  const scroller = scrollingAncestor(revealed);
  const view = revealed.ownerDocument.defaultView;
  const port =
    scroller === null
      ? { top: 0, bottom: view?.innerHeight ?? 0 }
      : scroller.getBoundingClientRect();
  const distance = Math.min(
    revealed.getBoundingClientRect().bottom - port.bottom,
    choice.getBoundingClientRect().top - port.top - CHOICE_MARGIN,
  );
  if (distance <= 0) return;
  const options: ScrollToOptions = {
    top: distance,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  };
  if (scroller === null) view?.scrollBy(options);
  else scroller.scrollBy(options);
}
