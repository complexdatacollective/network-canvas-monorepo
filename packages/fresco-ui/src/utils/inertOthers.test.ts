import { afterEach, describe, expect, it } from 'vitest';

import { inertOthers } from './inertOthers';

const build = (html: string) => {
  document.body.innerHTML = html;
};

afterEach(() => {
  document.body.innerHTML = '';
});

const el = (id: string) => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`no #${id}`);
  return found;
};

describe('inertOthers', () => {
  it('inerts every element outside the inside element, and restores on release', () => {
    build(`
      <div id="app"><button id="background">Return to start screen</button></div>
      <div id="portals">
        <div id="modal"><button id="inside">Cancel</button></div>
      </div>
    `);

    const release = inertOthers([el('modal')]);

    expect(el('app').hasAttribute('inert')).toBe(true);
    // The portal container is on the keep path, so it is walked rather than
    // inerted, and the modal itself is untouched.
    expect(el('portals').hasAttribute('inert')).toBe(false);
    expect(el('modal').hasAttribute('inert')).toBe(false);

    release();
    expect(el('app').hasAttribute('inert')).toBe(false);
  });

  it('inerts a SIBLING modal in the same portal container', () => {
    // The case the acceptance criterion names: every modal in the app portals
    // into one shared container, so the parent dialog is a sibling of the child
    // picker — an ancestor walk would never separate them.
    build(`
      <div id="app"></div>
      <div id="portals">
        <div id="parent-modal"><button id="parent-control">Change variable</button></div>
        <div id="child-modal"><input id="picker-input" /></div>
      </div>
    `);

    const release = inertOthers([el('child-modal')]);

    expect(el('parent-modal').hasAttribute('inert')).toBe(true);
    expect(el('child-modal').hasAttribute('inert')).toBe(false);

    release();
    expect(el('parent-modal').hasAttribute('inert')).toBe(false);
  });

  it('leaves live regions announceable', () => {
    // `inert` removes a subtree from the accessibility tree. ArrayField mounts
    // its announcement region on document.body, OUTSIDE the portal — sweeping
    // it would silence the add/remove/reorder announcements raised from inside
    // the very dialogs this exists for.
    build(`
      <div id="app"></div>
      <div id="live" role="status" aria-live="polite"></div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = inertOthers([el('modal')]);

    expect(el('live').hasAttribute('inert')).toBe(false);
    expect(el('app').hasAttribute('inert')).toBe(true);

    release();
  });

  it('keeps an element inert until the last overlapping sweep releases it', () => {
    build(`
      <div id="app"></div>
      <div id="portals"><div id="first"></div><div id="second"></div></div>
    `);

    const releaseFirst = inertOthers([el('first')]);
    const releaseSecond = inertOthers([el('second')]);

    expect(el('app').hasAttribute('inert')).toBe(true);

    releaseSecond();
    expect(el('app').hasAttribute('inert')).toBe(true);

    releaseFirst();
    expect(el('app').hasAttribute('inert')).toBe(false);
    expect(el('second').hasAttribute('inert')).toBe(false);
  });

  it('ignores content added after the sweep', () => {
    // A snapshot, not a live rule — matching Base UI's own semantics, and the
    // reason a Select, Combobox, Popover, Tooltip or Toast opened INSIDE a
    // dialog keeps working: its portal node is created after the sweep ran, so
    // it was never in the set.
    build(`
      <div id="app"></div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = inertOthers([el('modal')]);

    const laterPopup = document.createElement('div');
    laterPopup.id = 'select-listbox';
    el('portals').append(laterPopup);

    expect(laterPopup.hasAttribute('inert')).toBe(false);
    release();
  });

  it('does not remove an `inert` that was already there', () => {
    build(`
      <div id="app" inert></div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = inertOthers([el('modal')]);
    release();

    expect(el('app').hasAttribute('inert')).toBe(true);
  });

  it('is a no-op for an inside element that is not in the document', () => {
    build(`<div id="app"></div>`);
    const detached = document.createElement('div');

    const release = inertOthers([detached]);

    expect(el('app').hasAttribute('inert')).toBe(false);
    expect(() => release()).not.toThrow();
  });

  it('releases only once, however many times it is called', () => {
    build(`
      <div id="app"></div>
      <div id="portals"><div id="first"></div><div id="second"></div></div>
    `);

    const releaseFirst = inertOthers([el('first')]);
    const releaseSecond = inertOthers([el('second')]);

    releaseFirst();
    releaseFirst();

    expect(el('app').hasAttribute('inert')).toBe(true);
    releaseSecond();
    expect(el('app').hasAttribute('inert')).toBe(false);
  });
});

describe('inertOthers live-region scope', () => {
  it('does not exempt a live region belonging to another dialog', () => {
    // `inert` is inherited and cannot be undone on a descendant, so exempting a
    // live region keeps its whole ancestor path out of the sweep. Every dialog
    // body holds a field-error live region inside its scroll viewport, and that
    // viewport is a tab stop when it overflows — exempting it left the parent
    // dialog reachable by Tab from inside a child picker.
    build(`
      <div id="app"></div>
      <div id="portals">
        <div id="parent-portal">
          <div role="dialog">
            <section id="parent-viewport" tabindex="0">
              <div id="field-errors" aria-live="polite"></div>
            </section>
          </div>
        </div>
        <div id="child-portal"><input /></div>
      </div>
    `);

    const release = inertOthers([el('child-portal')]);

    expect(el('parent-portal').hasAttribute('inert')).toBe(true);
    expect(el('parent-viewport').closest('[inert]')).not.toBeNull();

    release();
    expect(el('parent-portal').hasAttribute('inert')).toBe(false);
  });

  it('still exempts a live region that belongs to no dialog', () => {
    build(`
      <div id="app"><div id="announcer" role="status" aria-live="polite"></div></div>
      <div id="portals"><div id="modal"><div role="dialog"></div></div></div>
    `);

    const release = inertOthers([el('modal')]);

    expect(el('announcer').closest('[inert]')).toBeNull();
    release();
  });
});

describe('inertOthers keep-path containment', () => {
  it('takes an exempt live region’s ancestors out of the tab order, and puts them back', () => {
    // The ancestors cannot be inerted — that would silence the region they are
    // being kept for — but they must not remain reachable by Tab. Chrome makes
    // scroll containers focusable with no `tabindex` to show for it, which is
    // how the stage editor's scroller stayed reachable from inside a dialog.
    build(`
      <div id="app">
        <div id="scroller" style="overflow-y: auto">
          <div id="field-errors" aria-live="polite"></div>
          <button id="page-control">Return to start screen</button>
        </div>
      </div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = inertOthers([el('modal')]);

    expect(el('scroller').getAttribute('tabindex')).toBe('-1');
    expect(el('app').getAttribute('tabindex')).toBe('-1');
    // Its non-kept children are inert as usual.
    expect(el('page-control').closest('[inert]')).not.toBeNull();
    // And the region itself is still announceable.
    expect(el('field-errors').closest('[inert]')).toBeNull();

    release();
    expect(el('scroller').hasAttribute('tabindex')).toBe(false);
    expect(el('app').hasAttribute('tabindex')).toBe(false);
  });

  it('restores a tabindex the element already had', () => {
    build(`
      <div id="app" tabindex="0"><div id="live" aria-live="polite"></div></div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = inertOthers([el('modal')]);
    expect(el('app').getAttribute('tabindex')).toBe('-1');

    release();
    expect(el('app').getAttribute('tabindex')).toBe('0');
  });

  it('does not remove a tabindex another owner added DURING the sweep', () => {
    // The snapshot is only good while nobody else writes the attribute, and
    // React does: it re-renders the element with a different `tabIndex` prop
    // while a dialog is open (a `ScrollArea` viewport whose content stops
    // overflowing; Architect's upload control, which react-dropzone takes out
    // of the tab order for the duration of an import and React puts back).
    // Releasing to the snapshot removes the attribute the other owner just
    // wrote — and React's DOM cache still holds that value, so it never writes
    // it again and the control is untabbable until it remounts.
    build(`
      <div id="app"><div id="live" aria-live="polite"></div></div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = inertOthers([el('modal')]);
    expect(el('app').getAttribute('tabindex')).toBe('-1');

    // A different owner takes the attribute over mid-sweep.
    el('app').setAttribute('tabindex', '0');

    release();
    expect(el('app').getAttribute('tabindex')).toBe('0');
  });

  it('still restores its own value when nobody else touched it', () => {
    // The other half of the ownership rule, and the reason it is written as
    // "is the value still the `-1` we wrote?": an untouched element must go
    // back to exactly what it had, not be left neutralised for the session.
    build(`
      <div id="app" tabindex="2"><div id="live" aria-live="polite"></div></div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = inertOthers([el('modal')]);
    expect(el('app').getAttribute('tabindex')).toBe('-1');

    release();
    expect(el('app').getAttribute('tabindex')).toBe('2');
  });
});

describe('inertOthers boundaries', () => {
  it('never makes the document element focusable', () => {
    // <html> is on every keep path (the walk goes to the top of the tree).
    // Giving it `tabindex="-1"` makes it focusable for the life of every
    // dialog, and a focus-return target of <html> resolves to the document's
    // FIRST TABBABLE ELEMENT — the "focus restarts at the header" symptom.
    build(`
      <div id="app"><div id="live" aria-live="polite"></div></div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = inertOthers([el('modal')]);

    expect(document.documentElement.hasAttribute('tabindex')).toBe(false);
    expect(document.documentElement.hasAttribute('inert')).toBe(false);

    release();
  });

  it('inerts a role-only status region rather than leaving its controls tabbable', () => {
    // Base UI exempts `[aria-live]` and nothing else from its own `aria-hidden`
    // marking. Exempting more here would leave those subtrees hidden from
    // assistive technology by Base UI *and* in the tab order — which is the
    // `aria-hidden-focus` failure this file exists to remove. The install
    // banner is an `Alert` with `role="status"`, no `aria-live`, and buttons.
    build(`
      <div id="app">
        <div id="banner" role="status"><button id="dismiss">Dismiss</button></div>
      </div>
      <div id="portals"><div id="modal"><div role="dialog"></div></div></div>
    `);

    const release = inertOthers([el('modal')]);

    expect(el('dismiss').closest('[inert]')).not.toBeNull();

    release();
    expect(el('dismiss').closest('[inert]')).toBeNull();
  });
});
