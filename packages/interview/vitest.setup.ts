// jest-dom matchers (toBeInTheDocument, toHaveAttribute, etc.) for unit tests.
import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement Element.scrollTo — polyfill as a no-op so code that
// calls scrollTo after an invalid form submission (fresco-ui's
// focusFirstError) doesn't throw under tests. Mirrors fresco-ui's own
// vitest.setup.ts polyfill for the same underlying jsdom gap.
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = function scrollTo() {
    // no-op
  };
}
