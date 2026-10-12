// jest-dom matchers (toBeInTheDocument, toHaveAttribute, etc.) for unit tests.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// jsdom doesn't implement Element.scrollTo. fresco-ui's default
// onSubmitInvalid (focusFirstError) scrolls the first invalid field into view,
// so a missing shim surfaces as an unhandled error in any invalid-submit test.
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = function scrollTo() {
    // no-op
  };
}

// The Shell keeps the participant's language choice in the tab's
// sessionStorage, keyed by interview id. Many tests share an interview id, so
// a choice made in one must not carry into the next.
afterEach(() => {
  if (typeof window !== 'undefined') window.sessionStorage.clear();
});
