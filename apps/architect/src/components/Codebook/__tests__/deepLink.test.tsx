import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import developmentProtocol from '@codaco/protocols/development';
import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';

import Codebook from '../Codebook';
import { codebookHref } from '../deepLink';

/**
 * Opening the codebook at one attribute.
 *
 * The href and the row are built from the same subject key by the same module,
 * so what is under test is that a real link lands a researcher on a real row —
 * with FOCUS, not merely scroll, because a keyboard or screen-reader user who
 * is only scrolled to a row is still wherever they were.
 *
 * `scrollIntoView` is not implemented in jsdom, so it is stubbed; every
 * assertion below is about focus, which jsdom does implement.
 */

const PERSON = 'person_node_type';
// person.age, as the development protocol keys it.
const AGE = 'c5fee926-855d-4419-b5bb-54e89010cea6';

const renderCodebook = (path: string) => {
  window.history.replaceState(null, '', path);
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    protocolActions.setActiveProtocol(
      structuredClone(developmentProtocol) as unknown as CurrentProtocol,
    ),
  );

  return render(
    <Provider store={store}>
      <Codebook />
    </Provider>,
  );
};

const variableRow = (variableId: string) =>
  document.querySelector<HTMLElement>(
    `[data-codebook-variable="node:${PERSON}/${variableId}"]`,
  );

// jsdom implements neither, and both are called on the way to a row.
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;
vi.stubGlobal('scrollTo', vi.fn());

afterEach(() => {
  scrollIntoView.mockClear();
  window.history.replaceState(null, '', '/');
});

describe('opening the codebook at an attribute', () => {
  it('scrolls to the row the link names and lands focus in it', async () => {
    renderCodebook(codebookHref({ entity: 'node', type: PERSON }, AGE));

    const row = variableRow(AGE);
    expect(row).not.toBeNull();

    await waitFor(() => {
      expect(row!.contains(document.activeElement)).toBe(true);
    });
    // The row's own control, so the next keystroke acts on this attribute
    // rather than on a container that merely holds it.
    expect(document.activeElement?.tagName).toBe('BUTTON');
    expect(scrollIntoView.mock.instances).toContain(row);
  });

  it('leaves a plain codebook link alone', () => {
    renderCodebook('/protocol/codebook');

    // Nothing is scrolled to and focus stays where the route change put it —
    // `<body>` here, since nothing in this render claims it.
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
    expect(variableRow(AGE)).not.toBeNull();
  });

  it('falls back to the type’s section for an attribute that is not there', () => {
    renderCodebook(
      codebookHref({ entity: 'node', type: PERSON }, 'no-such-variable'),
    );

    const section = document.querySelector(
      `[data-codebook-entity="node:${PERSON}"]`,
    );
    expect(scrollIntoView.mock.instances).toEqual([section]);
    // No row to work on, so nothing takes focus.
    expect(document.activeElement).toBe(document.body);
  });

  it('scrolls to a type without claiming focus when no attribute is named', () => {
    renderCodebook(codebookHref({ entity: 'node', type: PERSON }));

    expect(scrollIntoView.mock.instances).toEqual([
      document.querySelector(`[data-codebook-entity="node:${PERSON}"]`),
    ]);
    expect(document.activeElement).toBe(document.body);
    expect(screen.getByLabelText('Search the codebook by name')).toBeTruthy();
  });
});
