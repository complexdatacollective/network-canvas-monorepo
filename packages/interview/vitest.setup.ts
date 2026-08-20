// jest-dom matchers (toBeInTheDocument, toHaveAttribute, etc.) for unit tests.
import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement Element.scrollTo. fresco-ui's default
// onSubmitInvalid (focusFirstError) scrolls the first invalid field into view,
// so a missing shim surfaces as an unhandled error in any invalid-submit test.
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = function scrollTo() {
    // no-op
  };
}
