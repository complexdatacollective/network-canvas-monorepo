import { afterEach, describe, expect, it } from 'vitest';

import { findDanglingIdReferences } from '../ariaIdReferences';

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findDanglingIdReferences', () => {
  it('reports a reference to an ID that is not in the document', () => {
    const host = mount('<input aria-describedby="missing-hint" />');

    expect(findDanglingIdReferences(host)).toEqual([
      { element: 'input', attribute: 'aria-describedby', id: 'missing-hint' },
    ]);
  });

  it('reports only the unresolved half of a mixed list', () => {
    const host = mount(`
      <span id="hint">Hint</span>
      <input id="control" aria-describedby="hint missing-error" />
    `);

    expect(findDanglingIdReferences(host)).toEqual([
      {
        element: 'input#control',
        attribute: 'aria-describedby',
        id: 'missing-error',
      },
    ]);
  });

  it('reports a dangling label reference, which costs the control its name', () => {
    const host = mount('<input aria-label="Name" aria-labelledby="gone" />');

    expect(findDanglingIdReferences(host)).toEqual([
      { element: 'input', attribute: 'aria-labelledby', id: 'gone' },
    ]);
  });

  it('finds nothing when every reference resolves', () => {
    const host = mount(`
      <span id="label">Name</span>
      <span id="hint">As it appears on your ID</span>
      <input aria-labelledby="label" aria-describedby="hint" />
    `);

    expect(findDanglingIdReferences(host)).toEqual([]);
  });

  it('checks the root element itself, not only its descendants', () => {
    const host = mount('<div></div>');
    const control = document.createElement('input');
    control.setAttribute('aria-controls', 'missing-panel');
    host.append(control);

    expect(findDanglingIdReferences(control)).toEqual([
      { element: 'input', attribute: 'aria-controls', id: 'missing-panel' },
    ]);
  });

  it('resolves against the whole document, not the subtree it was given', () => {
    // A hint rendered into a portal is still a live reference.
    mount('<span id="portalled-hint">Hint</span>');
    const host = mount('<input aria-describedby="portalled-hint" />');

    expect(findDanglingIdReferences(host)).toEqual([]);
  });

  it('ignores an empty reference attribute', () => {
    const host = mount('<input aria-describedby="" />');

    expect(findDanglingIdReferences(host)).toEqual([]);
  });
});
