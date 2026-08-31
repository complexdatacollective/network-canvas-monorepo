import { afterEach, describe, expect, it } from 'vitest';

import { SectionOutlineStore } from '../outlineStore.ts';

afterEach(() => {
  document.body.replaceChildren();
});

function mountSection(id: string): HTMLElement {
  const element = document.createElement('section');
  element.id = id;
  document.body.append(element);
  return element;
}

describe('SectionOutlineStore', () => {
  it('follows the page when sections change places', () => {
    const store = new SectionOutlineStore();
    const first = mountSection('first');
    const second = mountSection('second');
    store.registerSection({ id: 'first', title: 'First' });
    store.registerSection({ id: 'second', title: 'Second' });
    store.setSectionElement('first', first);
    store.setSectionElement('second', second);

    expect(store.getSnapshot().map((section) => section.title)).toEqual([
      'First',
      'Second',
    ]);

    // Moved without registering, being renamed, or changing availability —
    // nothing the store is told about. The outline still has to agree with
    // the reading order a researcher now sees.
    document.body.prepend(second);

    expect(store.getSnapshot().map((section) => section.title)).toEqual([
      'Second',
      'First',
    ]);
  });

  it('hands back the same snapshot while nothing has moved', () => {
    const store = new SectionOutlineStore();
    const element = mountSection('only');
    store.registerSection({ id: 'only', title: 'Only' });
    store.setSectionElement('only', element);

    // Identity has to hold, or `useSyncExternalStore` would re-render forever.
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });
});
