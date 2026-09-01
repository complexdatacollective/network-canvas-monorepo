import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import AppFrame, { type AppFrameProps } from '../AppFrame';

/**
 * Stands in for an area layout: the `<main>` the skip link targets is rendered
 * by a DESCENDANT of the component that renders the link, which is the whole
 * reason the link has to resolve its target at click time.
 */
const AreaLayout = ({ id = 'main-content' }: { id?: string }) => (
  <>
    <nav aria-label="Study">
      <a href="/study/1/participants">Participants</a>
    </nav>
    <main id={id}>
      <h1>Overview</h1>
    </main>
  </>
);

const renderFrame = (props?: Partial<AppFrameProps>) =>
  render(
    <AppFrame
      header={<span>Studio</span>}
      skipLinkLabel="Skip to main content"
      {...props}
    >
      {props?.children ?? <AreaLayout />}
    </AppFrame>,
  );

const getSkipLink = () =>
  screen.getByRole('link', { name: 'Skip to main content' });

describe('AppFrame landmarks', () => {
  it('renders no navigation and no main of its own', () => {
    render(
      <AppFrame
        header={<span>Studio</span>}
        skipLinkLabel="Skip to main content"
      >
        <p>Area content</p>
      </AppFrame>,
    );

    // The invariant that keeps the editor's outline from nesting inside the
    // study sidebar: both landmarks belong to the area, and an AppFrame that
    // grew either would give every editor route two of them and hand the skip
    // link the wrong target.
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('main')).toBeNull();
  });

  it('renders the header slot inside a banner it owns', () => {
    renderFrame({ header: <span>Studio header</span> });

    const banner = screen.getByRole('banner');
    expect(banner.tagName).toBe('HEADER');
    expect(within(banner).getByText('Studio header')).toBeInTheDocument();
  });

  it('leaves the area landmarks to its children', () => {
    renderFrame();

    expect(
      screen.getByRole('navigation', { name: 'Study' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });
});

describe('AppFrame structure', () => {
  it('renders the skip link, the header and the area region, and nothing else', () => {
    const { container } = renderFrame();

    const root = container.firstElementChild;
    if (!(root instanceof HTMLElement)) throw new Error('frame not rendered');

    // No fourth element and no empty one: an element the frame renders for
    // nobody is a stray grid cell in every app route that mounts it.
    expect(root.children).toHaveLength(3);
  });
});

describe('AppFrame skip link', () => {
  it('is the first focusable element, ahead of the header', () => {
    const { container } = renderFrame({
      header: <button type="button">Account</button>,
    });

    const focusable = container.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]',
    );
    expect(focusable[0]).toBe(getSkipLink());

    const banner = screen.getByRole('banner');
    // Node.DOCUMENT_POSITION_FOLLOWING: the header comes after the link.
    expect(
      getSkipLink().compareDocumentPosition(banner) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('points at the main a descendant renders', () => {
    renderFrame();

    expect(getSkipLink()).toHaveAttribute('href', '#main-content');
  });

  it('moves focus to the main, which is not focusable on its own', () => {
    renderFrame();
    const main = screen.getByRole('main');

    // The precondition this component exists for: a fragment link scrolls to
    // its target but only focuses it if it is already focusable.
    expect(main).not.toHaveAttribute('tabindex');

    fireEvent.click(getSkipLink());

    expect(main).toHaveFocus();
  });

  it('leaves the target as it found it once focus moves on', () => {
    renderFrame();
    const main = screen.getByRole('main');

    fireEvent.click(getSkipLink());
    expect(main).toHaveAttribute('tabindex', '-1');

    main.blur();

    expect(main).not.toHaveAttribute('tabindex');
  });

  it('respects a target that is already focusable', () => {
    renderFrame({
      children: (
        <main id="main-content" tabIndex={-1}>
          <h1>Overview</h1>
        </main>
      ),
    });
    const main = screen.getByRole('main');

    fireEvent.click(getSkipLink());
    expect(main).toHaveFocus();

    main.blur();

    // Not ours to remove: the host put it there.
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('does not let the browser write the fragment into the URL', () => {
    renderFrame();
    const hashBefore = window.location.hash;

    const notCancelled = fireEvent.click(getSkipLink());

    expect(notCancelled).toBe(false);
    expect(window.location.hash).toBe(hashBefore);
  });

  it('honours a custom skip target id', () => {
    renderFrame({
      skipToId: 'editor-content',
      children: (
        <main id="editor-content">
          <h1>Codebook</h1>
        </main>
      ),
    });

    expect(getSkipLink()).toHaveAttribute('href', '#editor-content');

    fireEvent.click(getSkipLink());

    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('does nothing when no element matches the target id', () => {
    renderFrame({ children: <p>An area that renders no main yet</p> });
    const link = getSkipLink();
    link.focus();

    expect(() => fireEvent.click(link)).not.toThrow();
    expect(link).toHaveFocus();
  });
});

describe('AppFrame skip link target resolution', () => {
  const frames: HTMLIFrameElement[] = [];

  afterEach(() => {
    for (const frame of frames.splice(0)) frame.remove();
    document.getElementById('main-content')?.remove();
  });

  it('resolves the target in the anchor’s own document, not the ambient one', () => {
    // A decoy carrying the same id in the ambient document. Anything reading
    // the ambient `document` finds this one and focuses a `<main>` on a
    // different page from the link the researcher activated.
    const decoy = document.createElement('main');
    decoy.id = 'main-content';
    decoy.tabIndex = -1;
    document.body.append(decoy);

    const frame = document.createElement('iframe');
    document.body.append(frame);
    frames.push(frame);

    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error('iframe has no document');

    const container = frameDocument.createElement('div');
    frameDocument.body.append(container);

    render(
      <AppFrame
        header={<span>Studio</span>}
        skipLinkLabel="Skip to main content"
      >
        <AreaLayout />
      </AppFrame>,
      { container, baseElement: frameDocument.body },
    );

    // `instanceof` is not available here: the frame is a separate realm, so its
    // `HTMLAnchorElement` is a different constructor from this one.
    const link = frameDocument.querySelector('a[href="#main-content"]');
    if (!link)
      throw new Error('skip link not rendered into the frame document');

    fireEvent.click(link);

    const main = frameDocument.querySelector('main');
    expect(frameDocument.activeElement).toBe(main);
    expect(decoy).not.toHaveFocus();
  });
});
