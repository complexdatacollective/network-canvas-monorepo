const scrollTo = (target: HTMLElement) => {
  if (!target) {
    return;
  }

  // Preserve the legacy 200px offset: land the target below the top edge rather
  // than flush against it. `scroll-margin-top` applies the offset to the native
  // `scrollIntoView` — alignment only, no layout impact.
  target.style.scrollMarginTop = '200px';
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export default scrollTo;
