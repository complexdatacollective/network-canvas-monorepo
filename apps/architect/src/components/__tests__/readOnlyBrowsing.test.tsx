import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { ByRoleMatcher } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import Routes from '~/components/Routes';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import {
  type ProtocolLockState,
  setActiveProtocolId,
  setProtocolLockState,
} from '~/ducks/modules/app';
import { rootReducer } from '~/ducks/modules/root';
import { developmentProtocol } from '~/templates/development-protocol';

/**
 * Every `/protocol` page, rendered as a tab sees it while another tab holds the
 * protocol, must offer nothing that edits it.
 *
 * Deliberately a sweep over what is on the page rather than a list of the
 * controls known to edit: a control added later is caught without anyone
 * remembering to add it here. Anything that accepts input, and anything that
 * acts, fails the sweep unless it is disabled — or is one of the navigation
 * and viewing actions below, named one by one.
 */

// The summary resolves the columns of each network resource from its stored
// file, and there are no stored files here.
vi.mock('~/utils/protocols/assetTools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/protocols/assetTools')>()),
  getNetworkVariables: vi.fn(async () => []),
}));

type AllowedControl = {
  role: ByRoleMatcher;
  name: RegExp;
  // For controls named by protocol content: allowed only inside this landmark.
  within?: { role: ByRoleMatcher; name: RegExp };
};

// What a tab that cannot edit may still do: move around the protocol, look at
// it, and take a copy of it.
const ALLOWED: readonly AllowedControl[] = [
  // Header and app menu.
  { role: 'button', name: /^return to start screen$/i },
  { role: 'button', name: /^open menu$/i },
  { role: 'combobox', name: /^interface language:/i },
  { role: 'button', name: /^download$/i },
  { role: 'button', name: /^print$/i },
  { role: 'button', name: /^return to stages$/i },
  {
    role: 'button',
    name: /./,
    within: { role: 'navigation', name: /^breadcrumb$/i },
  },
  // Stages: opening a stage opens its editor, which is read-only too.
  { role: 'button', name: /^edit stage \d+:/i },
  { role: 'button', name: /^how to get a mapbox token$/i },
  // Codebook: search, filter and sort, and a look at a network resource.
  { role: 'searchbox', name: /^search the codebook/i },
  { role: 'checkbox', name: /^show unused only$/i },
  { role: 'button', name: /^(name|used in)$/i },
  { role: 'button', name: /^preview$/i },
  // Resources: filter by type, preview, download.
  {
    role: 'button',
    name: /^(all|image|video|audio|network|geojson|api key)$/i,
  },
  { role: 'button', name: /^preview ./i },
  { role: 'button', name: /^download ./i },
  // Experiments.
  { role: 'button', name: /^go back$/i },
  // Stage editor: move between sections, close it, preview the stage.
  {
    role: 'button',
    name: /./,
    within: { role: 'navigation', name: /^stage sections$/i },
  },
  { role: 'button', name: /^cancel$/i },
  { role: 'button', name: /^preview settings$/i },
];

const ACTION_ROLES: readonly ByRoleMatcher[] = [
  'button',
  'checkbox',
  'combobox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'textbox',
];

// Inputs without a role of their own (a file input) are caught here.
const EDITABLE_SELECTOR = [
  'input:not([type="hidden"])',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

// The native input Base UI keeps behind a visible control for form
// submission. The visible control is the one checked.
const isNativeStandIn = (element: Element) =>
  element.matches('input[aria-hidden="true"]');

const isOperable = (element: Element) =>
  !element.matches(':disabled') &&
  element.closest('[aria-disabled="true"]') === null &&
  element.closest('[inert]') === null;

const describeElement = (element: Element) => {
  const label = (
    element.getAttribute('aria-label') ??
    element.getAttribute('name') ??
    element.textContent ??
    ''
  )
    .trim()
    .replace(/\s+/g, ' ');
  const role = element.getAttribute('role');
  const tag = `<${element.tagName.toLowerCase()}${role ? ` role="${role}"` : ''}>`;
  // Nothing readable to go on: show enough markup to find it.
  return label === ''
    ? `${tag} ${element.outerHTML.replace(/ class="[^"]*"/g, '').slice(0, 160)}`
    : `${tag} ${label.slice(0, 80)}`;
};

const queryAllowed = ({ role, name, within: landmark }: AllowedControl) => {
  const scopes = landmark
    ? screen.queryAllByRole(landmark.role, {
        name: landmark.name,
        hidden: true,
      })
    : [document.body];
  return scopes.flatMap((scope) =>
    within(scope).queryAllByRole(role, { name, hidden: true }),
  );
};

const findOperableControls = () => {
  const allowed = new Set<Element>(ALLOWED.flatMap(queryAllowed));
  const controls = new Set<Element>([
    ...ACTION_ROLES.flatMap((role) =>
      screen.queryAllByRole(role, { hidden: true }),
    ),
    ...document.body.querySelectorAll(EDITABLE_SELECTOR),
  ]);

  return [...controls]
    .filter(
      (element) =>
        !allowed.has(element) &&
        !isNativeStandIn(element) &&
        isOperable(element),
    )
    .map(describeElement);
};

const createStore = (lockState: ProtocolLockState) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });
  store.dispatch(setActiveProtocolId('development'));
  store.dispatch(setActiveProtocol(developmentProtocol));
  store.dispatch(setProtocolLockState(lockState));
  return store;
};

const renderRoute = async (path: string, lockState: ProtocolLockState) => {
  const { hook } = memoryLocation({ path, static: true });
  render(
    <Provider store={createStore(lockState)}>
      <Router hook={hook}>
        <Routes />
      </Router>
    </Provider>,
  );
  // Every route draws a heading for RouteFocus to land on: the page, not the
  // start screen the guard would have sent a protocol-less tab to.
  await waitFor(() => {
    expect(document.querySelector('[data-route-focus-target]')).not.toBeNull();
  });
};

type NamedRoute = readonly [name: string, path: string];

// One stage of each interface, each opened in its own editor.
const stagesByType = new Map(
  developmentProtocol.stages.map((stage) => [stage.type, stage]),
);
const STAGE_ROUTES: readonly NamedRoute[] = [...stagesByType.values()].map(
  (stage): NamedRoute => [stage.type, `/protocol/stage/${stage.id}`],
);

const PAGE_ROUTES: readonly NamedRoute[] = [
  ['Stages', '/protocol'],
  ['Codebook', '/protocol/codebook'],
  ['Resources', '/protocol/assets'],
  ['Summary', '/protocol/summary'],
  ['Experiments', '/protocol/experiments'],
];

const EDITABLE_ROUTES: readonly NamedRoute[] = [
  ...PAGE_ROUTES.filter(([name]) => name !== 'Summary'),
  ...STAGE_ROUTES.slice(0, 1),
];

describe('browsing a protocol another tab holds', () => {
  it.each(PAGE_ROUTES)(
    'offers nothing that edits on the %s page',
    async (_page, path) => {
      await renderRoute(path, 'open-elsewhere');

      await waitFor(() => {
        expect(findOperableControls()).toEqual([]);
      });
    },
  );

  it.each(STAGE_ROUTES)(
    'opens a %s stage read-only, with nothing that edits it',
    async (_type, path) => {
      await renderRoute(path, 'open-elsewhere');

      // The editor's own explanation, shown once it has been refused the stage.
      await screen.findByText(
        'Another tab is editing this stage, so you can read it but not change it.',
      );
      await waitFor(() => {
        expect(findOperableControls()).toEqual([]);
      });
    },
    30_000,
  );

  // The sweep is only worth something if it would see an editing control. Each
  // of these pages offers some while this tab holds the protocol.
  it.each(EDITABLE_ROUTES)(
    'finds editing controls on the %s page while this tab holds the protocol',
    async (_page, path) => {
      await renderRoute(path, 'owned');

      await waitFor(() => {
        expect(findOperableControls()).not.toEqual([]);
      });
    },
    30_000,
  );
});
