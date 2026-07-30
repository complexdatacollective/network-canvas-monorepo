// jest-dom matchers (toBeInTheDocument, toHaveAttribute, etc.) for unit tests.
import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement Element.scrollTo. Model it as an immediately
// completed scroll so focusFirstError's scrollend listener cancels its timeout
// fallback instead of leaving an 800ms timer alive across environment teardown.
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = function scrollTo() {
    queueMicrotask(() => {
      this.dispatchEvent(new Event('scrollend'));
    });
  };
}
