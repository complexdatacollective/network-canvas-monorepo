import scrollparent from 'scrollparent';

const scrollTo = (target: HTMLElement, offset = -200) => {
  if (!target) {
    return;
  }

  const scroller = scrollparent(target);
  const targetTop = target.getBoundingClientRect().top;

  if (scroller instanceof Document) {
    window.scrollTo({
      top: targetTop + window.scrollY + offset,
      behavior: 'smooth',
    });
    return;
  }

  const scrollerTop = scroller.getBoundingClientRect().top;
  const top = targetTop - scrollerTop + scroller.scrollTop + offset;
  scroller.scrollTo({ top, behavior: 'smooth' });
};

export default scrollTo;
