import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/** Render queued dialog copy through React, including message components and rich text. */
export const renderQueuedMessage = (message: ReactNode): string => {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(<>{message}</>);
  return container.textContent ?? '';
};
