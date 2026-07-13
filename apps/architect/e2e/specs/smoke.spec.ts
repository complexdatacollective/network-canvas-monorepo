import type { Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readProtocolJson, readStageJson } from '../helpers/read-store.js';

// The editor's protocol-name field (ProtocolInfoCard's `aria-label="Protocol
// name"` textbox) is a stable, already-existing element on `/protocol`. Its
// value is derived from the rehydrated redux store (`getProtocolName`), so
// asserting it renders with the seeded name proves the app actually booted,
// rehydrated, and routed — not just painted an empty shell — closing the gap
// left by the paint-timed `#boot-loader` wait.
const protocolNameField = (page: Page) =>
  page.getByRole('textbox', { name: 'Protocol name' });

test('seeds a protocol and lands in the editor', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol(), { name: 'Smoke Protocol' });
  await gotoProtocol(architectPage);

  // The editor booted and rendered the rehydrated protocol.
  await expect(protocolNameField(architectPage)).toHaveValue('Smoke Protocol');

  // ...and the durable store agrees with what was rendered.
  const protocol = await readProtocolJson(architectPage);
  expect(protocol.name).toBe('Smoke Protocol');
  expect(protocol.stages).toHaveLength(0);
});

test('reads a seeded stage back from the store', async ({
  architectPage,
  seed,
}) => {
  // A minimal Information stage (the simplest schema-8 stage type). The stage
  // is seeded synchronously before navigation, so this verifies readStageJson
  // returns the seeded stage at the given index — the 600ms autosave-debounce
  // path readStageJson polls past is genuinely exercised later by the UI-save
  // interface specs, not here.
  const protocol: CurrentProtocol = {
    ...emptyProtocol(),
    stages: [{ id: 'info-1', label: 'Info', type: 'Information', items: [] }],
  };
  await seed(protocol);
  await gotoProtocol(architectPage);

  // The editor booted and rendered before the store read.
  await expect(protocolNameField(architectPage)).toBeVisible();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.id).toBe('info-1');
  expect(stage.label).toBe('Info');
});
