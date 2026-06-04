import { spyOn } from 'storybook/test';

/**
 * Run a synthetic pointer interaction with pointer-capture stubbed out. base-ui
 * sliders capture the pointer on press; Firefox throws on `setPointerCapture`
 * for a synthetic (non-device) pointer id, which would abort the interaction.
 * Real pointers (and the e2e suite) are unaffected.
 */
export async function withPointerCaptureStubbed(fn: () => Promise<void>) {
  const proto = window.HTMLElement.prototype;
  const setCapture = spyOn(proto, 'setPointerCapture').mockImplementation(
    () => {},
  );
  const releaseCapture = spyOn(
    proto,
    'releasePointerCapture',
  ).mockImplementation(() => {});
  try {
    await fn();
  } finally {
    setCapture.mockRestore();
    releaseCapture.mockRestore();
  }
}
