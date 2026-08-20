import { afterEach, describe, expect, it } from 'vitest';

import { inertOthers } from './inertOthers';

const build = (html: string) => {
  document.body.innerHTML = html;
};

/**
 * Every sweep goes through `sweep` so `afterEach` can release the ones a
 * failing test never reached. A sweep holds a MutationObserver for its
 * lifetime, and resetting `innerHTML` does not disconnect one, so an
 * unreleased sweep leaves an observer live on nodes that have left the
 * document, and reference counts standing on them.
 *
 * That cannot reach the next test: `<body>` is never an observed target,
 * because a target has to contain no inside element and every inside element
 * is one `body.contains`. This is hygiene, not a cascade guard. Releasing
 * twice is a no-op, so it sits happily alongside each test's own `release()`.
 */
const outstanding: (() => void)[] = [];

const sweep = (insideElements: Element[]) => {
  const release = inertOthers(insideElements);
  outstanding.push(release);
  return release;
};

afterEach(() => {
  while (outstanding.length > 0) outstanding.pop()?.();
  document.body.innerHTML = '';
});

const el = (id: string) => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`no #${id}`);
  return found;
};

/**
 * MutationObserver records are delivered on a microtask, so every assertion
 * about content added during a sweep has to wait for one first.
 */
const flushMutations = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('inertOthers', () => {
  it('inerts every element outside the inside element, and restores on release', () => {
    build(`
      <div id="app"><button id="background">Return to start screen</button></div>
      <div id="portals">
        <div id="modal"><button id="inside">Cancel</button></div>
      </div>
    `);

    const release = sweep([el('modal')]);

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

    const release = sweep([el('child-modal')]);

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

    const release = sweep([el('modal')]);

    expect(el('live').hasAttribute('inert')).toBe(false);
    expect(el('app').hasAttribute('inert')).toBe(true);

    release();
  });

  it('keeps an element inert until the last overlapping sweep releases it', () => {
    build(`
      <div id="app"></div>
      <div id="portals"><div id="first"></div><div id="second"></div></div>
    `);

    const releaseFirst = sweep([el('first')]);
    const releaseSecond = sweep([el('second')]);

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

    const release = sweep([el('modal')]);

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

    const release = sweep([el('modal')]);
    release();

    expect(el('app').hasAttribute('inert')).toBe(true);
  });

  it('is a no-op for an inside element that is not in the document', () => {
    build(`<div id="app"></div>`);
    const detached = document.createElement('div');

    const release = sweep([detached]);

    expect(el('app').hasAttribute('inert')).toBe(false);
    expect(() => release()).not.toThrow();
  });

  it('releases only once, however many times it is called', () => {
    build(`
      <div id="app"></div>
      <div id="portals"><div id="first"></div><div id="second"></div></div>
    `);

    const releaseFirst = sweep([el('first')]);
    const releaseSecond = sweep([el('second')]);

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

    const release = sweep([el('child-portal')]);

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

    const release = sweep([el('modal')]);

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

    const release = sweep([el('modal')]);

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

  it('inerts content mounted onto the keep path DURING the sweep', async () => {
    // The keep path is walked, not inerted, so a sweep-time snapshot leaves
    // anything mounted onto it afterwards fully exposed. Architect's
    // protocol-lock banner is a direct child of the app column and mounts only
    // once the lock is lost — after the editor modal has already swept — so its
    // button had no inert ancestor while that dialog was open.
    build(`
      <div id="app">
        <div id="field-errors" aria-live="polite"></div>
      </div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = sweep([el('modal')]);

    const banner = document.createElement('div');
    banner.id = 'lock-banner';
    banner.innerHTML = '<button id="show-me">Show Me What to Do</button>';
    el('app').append(banner);

    await flushMutations();
    expect(el('show-me').closest('[inert]')).not.toBeNull();

    release();
    expect(el('show-me').closest('[inert]')).toBeNull();
  });

  it('does not inert a popup portalled in DURING the sweep', async () => {
    // The other half of the rule above, and the reason the observer is not
    // pointed at the whole keep path: the shared portal container, `<body>` and
    // the app root all contain the modal, and a nested dialog's portal node is
    // added under that container after this sweep ran. Observing them would
    // inert the dialog on top of this one — and every Select, Combobox,
    // Popover or Tooltip opened from inside it.
    build(`
      <div id="app">
        <div id="field-errors" aria-live="polite"></div>
      </div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = sweep([el('modal')]);

    const laterPopup = document.createElement('div');
    laterPopup.id = 'select-listbox';
    el('portals').append(laterPopup);

    const bodyLevelPortal = document.createElement('div');
    bodyLevelPortal.id = 'toast-viewport';
    document.body.append(bodyLevelPortal);

    await flushMutations();
    expect(laterPopup.hasAttribute('inert')).toBe(false);
    expect(bodyLevelPortal.hasAttribute('inert')).toBe(false);

    release();
  });

  it('does not inert a message added INTO an exempt live region', async () => {
    // The walk stops at an exempt region, and so does the observer. Every
    // fresco-ui field keeps its `[aria-live]` wrapper mounted and empty, then
    // appends the error box as an element when the first message arrives —
    // inerting that is precisely the silencing the exemption exists to prevent.
    build(`
      <div id="app">
        <div id="field-errors" aria-live="polite"></div>
      </div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = sweep([el('modal')]);

    const message = document.createElement('div');
    message.id = 'error-box';
    el('field-errors').append(message);

    await flushMutations();
    expect(message.closest('[inert]')).toBeNull();

    release();
  });

  it('exempts a live region that MOUNTS during the sweep', async () => {
    // The walk exempts every `[aria-live]` element it meets. The observer has
    // to exempt them by the same RULE, not by membership of the set the sweep
    // froze: a region that did not exist then is not in it, and inerting a
    // region removes it from the accessibility tree — the silencing the
    // exemption exists to prevent, and one Base UI's own snapshot never
    // produces, since a snapshot leaves a late region untouched. Interview's
    // `GeospatialOfflineIndicator` mounts its `aria-live` node conditionally
    // rather than filling a pre-existing one.
    build(`
      <div id="app">
        <div id="field-errors" aria-live="polite"></div>
      </div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = sweep([el('modal')]);

    const offline = document.createElement('div');
    offline.id = 'offline';
    offline.setAttribute('aria-live', 'polite');
    offline.textContent = 'You are offline';
    el('app').append(offline);

    await flushMutations();
    expect(el('offline').closest('[inert]')).toBeNull();

    release();
  });

  it('keeps a live region nested inside a subtree mounted during the sweep', async () => {
    // The same rule one level down, which is how such an indicator actually
    // arrives: a wrapper mounts with the region inside it. `inert` is
    // inherited, so inerting the wrapper silences the region just as surely.
    // The kept wrapper gets exactly what the walk gives an exempt region's
    // ancestors — out of the tab order, with its off-path children inert — so
    // keeping it does not hand Tab a way back out of the dialog.
    build(`
      <div id="app">
        <div id="field-errors" aria-live="polite"></div>
      </div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = sweep([el('modal')]);

    const indicator = document.createElement('div');
    indicator.id = 'indicator';
    indicator.innerHTML =
      '<p id="offline-status" aria-live="polite">You are offline</p>' +
      '<button id="retry">Retry</button>';
    el('app').append(indicator);

    await flushMutations();
    expect(el('offline-status').closest('[inert]')).toBeNull();
    expect(el('indicator').getAttribute('tabindex')).toBe('-1');
    expect(el('retry').closest('[inert]')).not.toBeNull();

    release();
    expect(el('indicator').hasAttribute('tabindex')).toBe(false);
    expect(el('retry').closest('[inert]')).toBeNull();
  });

  it('goes on catching content mounted into a subtree kept for a late region', async () => {
    // Keeping that wrapper extends the keep path, and an unobserved keep path
    // is the hole the observer exists to close: the next thing the app mounts
    // beside the region would have no inert ancestor at all.
    build(`
      <div id="app">
        <div id="field-errors" aria-live="polite"></div>
      </div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = sweep([el('modal')]);

    const indicator = document.createElement('div');
    indicator.id = 'indicator';
    indicator.innerHTML =
      '<p id="offline-status" aria-live="polite">You are offline</p>';
    el('app').append(indicator);

    await flushMutations();
    expect(el('offline-status').closest('[inert]')).toBeNull();

    const banner = document.createElement('div');
    banner.id = 'lock-banner';
    banner.innerHTML = '<button id="show-me">Show Me What to Do</button>';
    el('indicator').append(banner);

    await flushMutations();
    expect(el('show-me').closest('[inert]')).not.toBeNull();
    expect(el('offline-status').closest('[inert]')).toBeNull();

    release();
    expect(el('show-me').closest('[inert]')).toBeNull();
  });

  it('restores a tabindex the element already had', () => {
    build(`
      <div id="app" tabindex="0"><div id="live" aria-live="polite"></div></div>
      <div id="portals"><div id="modal"></div></div>
    `);

    const release = sweep([el('modal')]);
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

    const release = sweep([el('modal')]);
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

    const release = sweep([el('modal')]);
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

    const release = sweep([el('modal')]);

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

    const release = sweep([el('modal')]);

    expect(el('dismiss').closest('[inert]')).not.toBeNull();

    release();
    expect(el('dismiss').closest('[inert]')).toBeNull();
  });
});
