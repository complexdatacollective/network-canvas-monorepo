import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type ExpectedText = string | { asymmetricMatch(actual: string): boolean };

// Hook tests capture queued React nodes before a Toast/Dialog mounts them.
// Render the real message component so the oracle still checks exact visible
// English copy; live-provider tests separately exercise language switching.
export function renderedMessage(expected: ExpectedText) {
  return {
    asymmetricMatch(actual: ReactNode): boolean {
      const container = document.createElement('div');
      container.innerHTML = renderToStaticMarkup(
        createElement(Fragment, null, actual),
      );
      const text = container.textContent ?? '';
      return typeof expected === 'string'
        ? text === expected
        : expected.asymmetricMatch(text);
    },
    toString: () => 'RenderedMessage',
    toAsymmetricMatcher: () =>
      `RenderedMessage(${typeof expected === 'string' ? expected : 'text matcher'})`,
  };
}
