import { isRunningInstalled } from './isRunningInstalled';

const ROOT_ID = 'root';
const ACTIVE_ATTRIBUTE = 'data-visual-viewport';
const ACTIVE_VALUE = 'active';
const VIEWPORT_PROPERTIES = [
  '--app-viewport-width',
  '--app-viewport-height',
  '--app-viewport-left',
  '--app-viewport-top',
] as const;

// Safe-area and cold-start discrepancies are small; an on-screen keyboard is
// not. Requiring a material reduction stops an initially short standalone-PWA
// VisualViewport from undoing the static 100vh fallback that reaches the real
// bottom edge on iPad.
const MIN_KEYBOARD_REDUCTION = 120;
const SCALE_EPSILON = 0.01;

function isEditableElement(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

function finiteMetric(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function positiveMetric(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getLayoutViewportHeight(viewport: VisualViewport): number {
  const documentHeight =
    document.documentElement.getBoundingClientRect().height;
  return Math.max(
    viewport.height,
    window.innerHeight,
    document.documentElement.clientHeight,
    documentHeight,
  );
}

function clearVisualViewportFrame(root: HTMLElement): void {
  root.removeAttribute(ACTIVE_ATTRIBUTE);
  for (const property of VIEWPORT_PROPERTIES) {
    root.style.removeProperty(property);
  }
  if (root.style.length === 0) {
    root.removeAttribute('style');
  }
}

/**
 * Keep Interviewer's full-screen root aligned to the part of the page that is
 * actually visible around Safari chrome and the software keyboard.
 *
 * The static 100vh root remains the fallback and the resting installed-PWA
 * size. Browser tabs always follow VisualViewport; an installed PWA opts in
 * only during a focused text-entry session with a material height reduction.
 */
export function initVisualViewportSizing(): () => void {
  const root = document.getElementById(ROOT_ID);
  const viewport = window.visualViewport;

  if (!root || !viewport) {
    return () => {};
  }

  const installed = isRunningInstalled();
  let textEntrySession = isEditableElement(document.activeElement);
  let firstFrame: number | undefined;
  let secondFrame: number | undefined;

  const applyViewportFrame = () => {
    // Resizing the layout in response to pinch zoom causes a reflow feedback
    // loop. Keep the most recent scale-1 frame until zoom returns to 100%.
    if (Math.abs(viewport.scale - 1) > SCALE_EPSILON) {
      return;
    }

    const editableActive = isEditableElement(document.activeElement);
    if (editableActive) {
      textEntrySession = true;
    }

    const layoutHeight = getLayoutViewportHeight(viewport);
    const materiallyShrunken =
      layoutHeight - viewport.height >= MIN_KEYBOARD_REDUCTION;

    if (!editableActive && !materiallyShrunken) {
      textEntrySession = false;
    }

    if (installed && !(textEntrySession && materiallyShrunken)) {
      clearVisualViewportFrame(root);
      return;
    }

    const width = positiveMetric(viewport.width, window.innerWidth);
    const height = positiveMetric(viewport.height, window.innerHeight);
    const left = Math.max(
      0,
      finiteMetric(
        viewport.pageLeft,
        window.scrollX + finiteMetric(viewport.offsetLeft, 0),
      ),
    );
    const top = Math.max(
      0,
      finiteMetric(
        viewport.pageTop,
        window.scrollY + finiteMetric(viewport.offsetTop, 0),
      ),
    );

    root.style.setProperty('--app-viewport-width', `${String(width)}px`);
    root.style.setProperty('--app-viewport-height', `${String(height)}px`);
    root.style.setProperty('--app-viewport-left', `${String(left)}px`);
    root.style.setProperty('--app-viewport-top', `${String(top)}px`);
    root.setAttribute(ACTIVE_ATTRIBUTE, ACTIVE_VALUE);
  };

  const cancelScheduledFrames = () => {
    if (firstFrame !== undefined) {
      window.cancelAnimationFrame(firstFrame);
      firstFrame = undefined;
    }
    if (secondFrame !== undefined) {
      window.cancelAnimationFrame(secondFrame);
      secondFrame = undefined;
    }
  };

  const handleViewportChange = () => {
    // Apply immediately, then sample again after two paints. WebKit can emit a
    // viewport event before its keyboard animation has committed final metrics.
    applyViewportFrame();
    cancelScheduledFrames();
    firstFrame = window.requestAnimationFrame(() => {
      firstFrame = undefined;
      secondFrame = window.requestAnimationFrame(() => {
        secondFrame = undefined;
        applyViewportFrame();
      });
    });
  };

  handleViewportChange();

  viewport.addEventListener('resize', handleViewportChange);
  viewport.addEventListener('scroll', handleViewportChange);
  viewport.addEventListener('scrollend', handleViewportChange);
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange);
  window.addEventListener('orientationchange', handleViewportChange);
  window.addEventListener('pageshow', handleViewportChange);
  document.addEventListener('focusin', handleViewportChange);
  document.addEventListener('focusout', handleViewportChange);
  document.addEventListener('visibilitychange', handleViewportChange);

  return () => {
    cancelScheduledFrames();
    viewport.removeEventListener('resize', handleViewportChange);
    viewport.removeEventListener('scroll', handleViewportChange);
    viewport.removeEventListener('scrollend', handleViewportChange);
    window.removeEventListener('resize', handleViewportChange);
    window.removeEventListener('scroll', handleViewportChange);
    window.removeEventListener('orientationchange', handleViewportChange);
    window.removeEventListener('pageshow', handleViewportChange);
    document.removeEventListener('focusin', handleViewportChange);
    document.removeEventListener('focusout', handleViewportChange);
    document.removeEventListener('visibilitychange', handleViewportChange);
    clearVisualViewportFrame(root);
  };
}
