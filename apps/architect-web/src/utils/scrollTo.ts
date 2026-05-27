const scrollTo = (target: HTMLElement) => {
  if (!target) {
    return;
  }

  // Preserve the legacy 200px offset: land the target below the top edge rather
  // than flush against it. `scroll-margin-top` applies the offset to the native
  // `scrollIntoView` — alignment only, no layout impact. The destination is
  // computed synchronously here, so restore the caller's prior inline value on
  // the next frame rather than leaving a stray offset on their element.
  const previousScrollMarginTop = target.style.scrollMarginTop;
  target.style.scrollMarginTop = '200px';
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  requestAnimationFrame(() => {
    target.style.scrollMarginTop = previousScrollMarginTop;
  });
};

export default scrollTo;
