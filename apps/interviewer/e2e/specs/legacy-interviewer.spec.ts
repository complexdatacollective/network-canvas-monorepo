import type { Frame, Page } from '@playwright/test';

import {
  expect,
  LEGACY_INTERVIEWER_STUB_CLOSE,
  LEGACY_INTERVIEWER_STUB_FINISH,
  LEGACY_INTERVIEWER_STUB_HEADING,
  type StubRecord,
  test,
} from '../fixtures/legacy-interviewer.js';
import {
  LEGACY_FINISHED_SESSION_ID,
  LEGACY_NODE_NICKNAME,
  LEGACY_PROTOCOL_HASH,
  LEGACY_PROTOCOL_NAME,
  LEGACY_SESSION_ID,
  legacyLibrarySeed,
  legacyNetcanvas,
} from '../fixtures/legacy-protocol.js';
import { clickWhenDeckSettles } from '../helpers/deck.js';
import { graphmlNodeCount, readEntries } from '../helpers/export-archive.js';
import {
  type DatabaseDump,
  dumpDatabase,
  seedAsInterviewer8,
} from '../helpers/legacy-database.js';

/**
 * Schema 8 protocols and interviews in the one shared database, beside a
 * bundled Interviewer 8: the deck shows them as protocol cards; starting,
 * resuming and reviewing an interview all go through /interview/<id>, which
 * hosts Interviewer 8 in a same-origin frame at /v8/interview/<id>, hands it
 * the unlock (so the researcher unlocks once, here) and goes home when it
 * says it has closed; a schema 8 file can be kept on schema 8 or upgraded on
 * import (a stored one is never upgraded); and deleting, exporting and
 * resetting work on those rows here.
 *
 * These need a build that bundles Interviewer 8, which the suite's own build
 * does not while nothing is pinned, so they run against a build of their own
 * with a stub page at /v8/ that plays Interviewer 8's side of the embed
 * contract (see `fixtures/legacy-interviewer.ts`). The stub is enough: what
 * Interviewer 9 owes Interviewer 8 is the frame, the reply to its 'ready'
 * (checked by decrypting a row with the key it carries), what follows its
 * 'closed', and the rows it wrote in the shared database, in Interviewer 8's
 * format; all are asserted here. Interviewer 8's own interview route is tested
 * on its side.
 *
 * The tests share one build per worker, so they run in order in one worker.
 */
test.describe.configure({ mode: 'default' });

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const legacyCard = (page: Page) =>
  page.getByRole('heading', { name: LEGACY_PROTOCOL_NAME });

/** Seed an 8.x device's database and open Interviewer 9 on it. */
const openOnInterviewer8Device = async (page: Page) => {
  await seedAsInterviewer8(page, legacyLibrarySeed());
  const before = await dumpDatabase(page);
  expect(before?.version).toBe(30);
  await page.goto('/');
  await expect(legacyCard(page)).toBeVisible();
  return before;
};

// force: true, as for the delete control (see ProtocolFixture.delete): the
// menu button sits in the active card's top-right corner, under the next
// card's bounding box in the deck's fanned 3D layout, which defeats
// Playwright's actionability pre-check though a real click there lands.
const openActionsMenu = (page: Page) =>
  clickWhenDeckSettles(
    page.getByRole('button', { name: `Actions for ${LEGACY_PROTOCOL_NAME}` }),
    { force: true },
  );

type Row = Record<string, unknown>;

const rowsOf = (dump: DatabaseDump | null, store: string): Row[] =>
  (dump?.stores[store]?.rows ?? []) as Row[];

const rowsFor = (dump: DatabaseDump | null, store: string, hash: string) =>
  rowsOf(dump, store).filter((row) => row.protocolHash === hash);

/**
 * Interviewer 8 only unlocks the shared lock and sends a device that has none
 * set up straight back, so in a browser tab with no lock (these tests' state)
 * every way into it opens set-up here first. Choose to use no lock.
 */
const setUpWizard = (page: Page) =>
  page.getByRole('dialog', { name: 'Setting up your device' });

const chooseNoLock = async (page: Page) => {
  await expect(setUpWizard(page)).toBeVisible();
  await page.getByTestId('wizard-next').click(); // intro → securing data
  await page.getByTestId('wizard-next').click(); // → method
  await page.locator('[data-value="none"]').click();
  await page
    .getByRole('dialog', { name: 'Continue without security?' })
    .getByRole('button', { name: 'Continue without security' })
    .click();
  await page.getByTestId('wizard-next').click(); // → analytics
  await page.getByTestId('wizard-next').click(); // Finish
};

// PINs are 8 digits.
const PIN = '24681357';

const hostedFrame = (page: Page) =>
  page.frameLocator('[data-testid="interviewer-8-frame"]');

/** Interviewer 8 (the stub) hosted in this page's frame, at `path`. */
const expectHosted = async (page: Page, path: string) => {
  await expect(page.getByTestId('interviewer-8-frame')).toHaveAttribute(
    'src',
    path,
  );
  await expect(
    hostedFrame(page).getByRole('heading', {
      name: LEGACY_INTERVIEWER_STUB_HEADING,
    }),
  ).toBeVisible();
};

const stubFrame = (page: Page): Frame => {
  const frame = page
    .frames()
    .find((candidate) => /\/v8\/interview\//.test(candidate.url()));
  if (!frame) throw new Error('Interviewer 8 is not hosted');
  return frame;
};

/** What the stub recorded of the handshake. */
const stubRecord = (page: Page): Promise<StubRecord> =>
  stubFrame(page).evaluate(
    () =>
      (window as unknown as { __interviewer8Stub: StubRecord })
        .__interviewer8Stub,
  );

/** The one reply, once the stub has finished with it. */
const settledReply = async (page: Page) => {
  await expect
    .poll(async () => {
      const [reply] = (await stubRecord(page)).replies;
      return (
        reply &&
        (reply.decryptedNetwork !== null ||
          reply.error !== null ||
          reply.key === null)
      );
    })
    .toBe(true);
  return (await stubRecord(page)).replies;
};

const NON_EXTRACTABLE_DATA_KEY = {
  type: 'secret',
  algorithm: 'AES-GCM',
  extractable: false,
  usages: ['decrypt', 'encrypt'],
};

const stepUp = (page: Page) =>
  page.getByRole('heading', { name: 'Confirm your identity' });
const lockScreen = (page: Page) =>
  page.getByRole('heading', { name: 'Welcome back' });

const typePin = async (page: Page, fieldName: string, pin: string) => {
  const inputs = page
    .getByTestId(`segmented-code-${fieldName}`)
    .locator('input');
  for (let i = 0; i < pin.length; i++) {
    await inputs.nth(i).fill(pin[i] ?? '');
  }
};

/**
 * Seed an 8.x device, then secure it with a PIN through set-up (which
 * re-encrypts the schema 8 rows, in Interviewer 8's format, with the key the
 * frame will be handed).
 */
const openOnSecuredInterviewer8Device = async (
  page: Page,
  { requireUnlockOnEnter = true }: { requireUnlockOnEnter?: boolean } = {},
) => {
  await openOnInterviewer8Device(page);
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByTestId('wizard-next').click(); // intro → securing data
  await page.getByTestId('wizard-next').click(); // → method
  await page.locator('[data-value="pin"]').click();
  await page.getByTestId('wizard-next').click(); // → configure
  await typePin(page, 'pin', PIN);
  await typePin(page, 'pin-confirm', PIN);
  await page
    .getByRole('checkbox', { name: /I understand there is no recovery/ })
    .check();
  await page.getByTestId('wizard-next').click(); // → behaviour
  const enterSwitch = page.getByRole('switch', {
    name: 'Require unlock when entering an interview',
  });
  await expect(enterSwitch).toBeChecked();
  if (!requireUnlockOnEnter) await enterSwitch.click();
  await page.getByTestId('wizard-next').click(); // → analytics
  await page.getByTestId('wizard-next').click(); // Finish
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(legacyCard(page)).toBeVisible();
  // Set-up's sweep has encrypted the schema 8 interviews.
  await expect
    .poll(async () =>
      rowsFor(await dumpDatabase(page), 'sessions', LEGACY_PROTOCOL_HASH).every(
        (row) => row._enc !== undefined,
      ),
    )
    .toBe(true);
};

/**
 * Open the data view by address. That is a full page load, which locks a
 * secured device (the key lives in memory only), so unlock it there with
 * `pin`.
 */
const openDataView = async (page: Page, pin?: string) => {
  await page.goto('/data');
  if (pin === undefined) return;
  await expect(lockScreen(page)).toBeVisible();
  await typePin(page, 'pin', pin);
  await expect(lockScreen(page)).toBeHidden();
};

const resumeFromDataView = async (page: Page, pin?: string) => {
  await openDataView(page, pin);
  await page.getByRole('button', { name: /^In progress ·/ }).click();
  await page.getByTestId('data-resume').first().click();
};

const startFromLegacyCard = async (page: Page, caseId: string) => {
  // Sorted by name, the schema 8 protocol is the first card; the deck starts
  // on the import card.
  await page.getByRole('button', { name: 'Go to card 1' }).click();
  await clickWhenDeckSettles(
    page.getByRole('button', { name: 'Start new interview' }),
  );
  await page.getByTestId('new-session-case-id').fill(caseId);
  await page.getByTestId('new-session-submit').click();
};

test('shows a schema 8 protocol as a protocol card with its schema', async ({
  page,
}) => {
  const before = await openOnInterviewer8Device(page);

  await page.getByRole('button', { name: 'Go to card 1' }).click();
  await expect(page.getByText('Schema 8', { exact: true })).toBeVisible();
  // This build bundles Interviewer 8, so the card can start an interview.
  await expect(page.getByText('Not available')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Start new interview' }),
  ).toBeVisible();

  await openActionsMenu(page);
  // A stored schema 8 protocol is never upgraded: only an import upgrades.
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText([
    'Info',
    'Delete',
  ]);
  await expect(page.getByText('Upgrade to schema 9')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Nothing about showing it is a write.
  const after = await dumpDatabase(page);
  for (const store of ['protocols', 'sessions', 'assets']) {
    expect(after?.stores[store]?.rows).toEqual(before?.stores[store]?.rows);
  }
});

test('starting an interview writes Interviewer 8’s session row and hosts it at /v8/interview/<id>', async ({
  page,
}) => {
  await openOnInterviewer8Device(page);

  await startFromLegacyCard(page, 'started-here');
  await chooseNoLock(page);

  await expect(page).toHaveURL(new RegExp(`/interview/(${UUID})$`));
  const [, id] =
    new URL(page.url()).pathname.match(new RegExp(`^/interview/(${UUID})$`)) ??
    [];
  await expectHosted(page, `/v8/interview/${id}`);
  // No lock: no key to hand over.
  expect((await settledReply(page)).map((reply) => reply.key)).toEqual([null]);

  // The row Interviewer 8 will run, in its own format: the fields its
  // createSession writes, unencrypted on a device with no lock.
  const sessions = rowsFor(
    await dumpDatabase(page),
    'sessions',
    LEGACY_PROTOCOL_HASH,
  );
  const started = sessions.find((row) => row.id === id);
  expect(started).toEqual({
    id,
    protocolHash: LEGACY_PROTOCOL_HASH,
    protocolName: LEGACY_PROTOCOL_NAME,
    caseId: 'started-here',
    startedAt: expect.any(String),
    lastUpdatedAt: expect.any(String),
    finishedAt: null,
    exportedAt: null,
    currentStep: 0,
    network: expect.objectContaining({ nodes: [], edges: [] }),
    isSynthetic: false,
  });
  expect(started).not.toHaveProperty('_enc');
});

test('with no lock set up, leaving set-up keeps the researcher here and starts nothing', async ({
  page,
}) => {
  const before = await openOnInterviewer8Device(page);

  await startFromLegacyCard(page, 'not-started');
  await expect(setUpWizard(page)).toBeVisible();
  await setUpWizard(page).getByRole('button', { name: 'Exit setup' }).click();
  await page
    .getByRole('dialog', { name: 'Exit setup?' })
    .getByRole('button', { name: 'Exit setup' })
    .click();

  await expect(setUpWizard(page)).toBeHidden();
  await expect(page).toHaveURL('/');
  await expect(legacyCard(page)).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('interviewer:vault')),
  ).toBeNull();
  expect(rowsOf(await dumpDatabase(page), 'sessions')).toEqual(
    rowsOf(before, 'sessions'),
  );
});

test('resuming a schema 8 interview hosts it at /v8/interview/<id>', async ({
  page,
}) => {
  await openOnInterviewer8Device(page);
  await resumeFromDataView(page);
  await chooseNoLock(page);

  await expect(page).toHaveURL(`/interview/${LEGACY_SESSION_ID}`);
  await expectHosted(page, `/v8/interview/${LEGACY_SESSION_ID}`);
});

test('reviewing a finished schema 8 interview hosts /v8/interview/<id>?mode=review', async ({
  page,
}) => {
  await openOnInterviewer8Device(page);
  await page.goto('/data');
  await page.getByRole('button', { name: /^Complete ·/ }).click();
  await expect(page.getByTestId('data-review')).toHaveCount(1);
  // Marking unfinished is not offered for a schema 8 interview.
  await expect(page.getByTestId('data-mark-unfinished')).toHaveCount(0);
  await page.getByTestId('data-review').click();
  await chooseNoLock(page);

  await expect(page).toHaveURL(
    `/interview/${LEGACY_FINISHED_SESSION_ID}?mode=review`,
  );
  await expectHosted(
    page,
    `/v8/interview/${LEGACY_FINISHED_SESSION_ID}?mode=review`,
  );
});

test('keeping a schema 8 file on schema 8 stores it in Interviewer 8’s format', async ({
  page,
}) => {
  const file = await legacyNetcanvas();
  await page.goto('/');
  await page.getByTestId('protocol-import-input').setInputFiles({
    name: 'legacy-study.netcanvas',
    mimeType: 'application/octet-stream',
    buffer: file,
  });

  const dialog = page.getByRole('dialog', {
    name: 'This protocol uses schema 8',
  });
  await expect(
    dialog.getByRole('link', { name: 'more information' }),
  ).toHaveAttribute(
    'href',
    'https://documentation.networkcanvas.com/en/get-started/protocol-schema-information',
  );
  await dialog.getByRole('button', { name: 'Keep on schema 8' }).click();
  await expect(page.getByText('Protocol imported')).toBeVisible({
    timeout: 15_000,
  });
  // Nowhere else to go: the protocol is here, on its own card.
  await expect(page).toHaveURL('/');
  await expect(legacyCard(page)).toBeVisible();

  // The rows Interviewer 8's own saveProtocol writes: keyed by the hash, the
  // document unchanged at schema 8, and each asset as `<hash>::<asset id>`
  // with its bytes as a Blob.
  const dump = await dumpDatabase(page);
  const [protocol, ...others] = rowsOf(dump, 'protocols').filter(
    (row) => row.name === LEGACY_PROTOCOL_NAME,
  );
  expect(others).toEqual([]);
  const hash = String(protocol?.hash);
  expect(hash).toMatch(/^[0-9A-Za-z_-]{43}$/);
  expect(protocol).toEqual({
    id: hash,
    hash,
    name: LEGACY_PROTOCOL_NAME,
    schemaVersion: 8,
    importedAt: expect.any(String),
    description: 'A schema 8 study',
    codebook: expect.objectContaining({ node: expect.any(Object) }),
    protocol: expect.objectContaining({
      schemaVersion: 8,
      name: LEGACY_PROTOCOL_NAME,
    }),
  });
  expect(rowsFor(dump, 'assets', hash)).toEqual([
    {
      id: `${hash}::map`,
      protocolHash: hash,
      assetId: 'map',
      // The manifest's display name, and the type the archive reader gives a
      // PNG (none: only SVG is given one); both majors share that reader.
      name: 'Map',
      type: 'image',
      data: { blob: '', bytes: [137, 80, 78, 71, 13, 10, 26, 10] },
    },
  ]);
});

test('deleting a schema 8 protocol removes it, its interviews and its assets', async ({
  page,
}) => {
  await openOnInterviewer8Device(page);

  await page.getByRole('button', { name: 'Go to card 1' }).click();
  await openActionsMenu(page);
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('dialog-primary').click();
  await expect(page.getByText('Protocol deleted')).toBeVisible();

  await expect(legacyCard(page)).toHaveCount(0);
  const dump = await dumpDatabase(page);
  expect(
    rowsOf(dump, 'protocols').filter(
      (row) => row.hash === LEGACY_PROTOCOL_HASH,
    ),
  ).toEqual([]);
  expect(rowsFor(dump, 'sessions', LEGACY_PROTOCOL_HASH)).toEqual([]);
  expect(rowsFor(dump, 'assets', LEGACY_PROTOCOL_HASH)).toEqual([]);
});

test('exports schema 8 interviews with the rest', async ({
  page,
  download,
}) => {
  await openOnInterviewer8Device(page);
  await page.goto('/data');
  await page.getByRole('button', { name: /^Complete ·/ }).click();
  await page
    .getByRole('checkbox', { name: 'Select all interviews on this page' })
    .check();

  const { files } = await download.captureExport(async () => {
    await page.getByTestId('data-export').click();
    await expect(
      page.getByRole('heading', { name: 'Archive ready' }),
    ).toBeVisible();
    await page.getByTestId('data-save-export').click();
  });

  // The finished interview's one person, as it was collected.
  const graphmls = readEntries(files, '.graphml');
  expect(graphmls).toHaveLength(1);
  expect(graphmlNodeCount(graphmls[0] ?? '')).toBe(1);
  expect(graphmls[0]).toContain(LEGACY_NODE_NICKNAME);
  await expect(page.getByText('Export complete')).toBeVisible();

  // Marked exported on its row, which is otherwise as Interviewer 8 wrote it.
  const finished = rowsOf(await dumpDatabase(page), 'sessions').find(
    (row) => row.id === LEGACY_FINISHED_SESSION_ID,
  );
  expect(finished?.exportedAt).toEqual(expect.any(String));
  expect(finished).not.toHaveProperty('_enc');
});

test('upgrading a schema 8 file on import says it imports a copy and leaves the file unchanged', async ({
  page,
}) => {
  const file = await legacyNetcanvas();
  await page.goto('/');
  await page.getByTestId('protocol-import-input').setInputFiles({
    name: 'legacy-study.netcanvas',
    mimeType: 'application/octet-stream',
    buffer: file,
  });

  const COPY_LINE =
    'Upgrading makes a copy of this protocol on schema 9 and imports that copy into this version of Interviewer. The original file is left unchanged.';
  const choice = page.getByRole('dialog', {
    name: 'This protocol uses schema 8',
  });
  await expect(choice.getByText(COPY_LINE)).toBeVisible();
  await choice.getByRole('button', { name: 'Upgrade to schema 9' }).click();

  const confirm = page.getByRole('dialog', { name: 'Upgrade to schema 9?' });
  await expect(confirm.getByText(COPY_LINE)).toBeVisible();
  await expect(
    confirm.getByText(
      'If you upgrade, the following changes will be made to your protocol:',
    ),
  ).toBeVisible();
  await confirm.getByRole('button', { name: 'Upgrade to schema 9' }).click();
  await expect(page.getByText('Protocol imported')).toBeVisible({
    timeout: 15_000,
  });

  // One protocol, the upgraded copy: nothing at schema 8 was stored.
  const imported = rowsOf(await dumpDatabase(page), 'protocols').filter(
    (row) => row.name === LEGACY_PROTOCOL_NAME,
  );
  expect(imported).toHaveLength(1);
  expect(imported[0]).toMatchObject({ schemaVersion: 9 });
});

test('under a PIN lock, starting asks once, in Interviewer 9, and hands Interviewer 8 the real key', async ({
  page,
}) => {
  await openOnSecuredInterviewer8Device(page);

  await startFromLegacyCard(page, 'secured-start');
  // Unlock-on-enter is on: the one step-up, here.
  await expect(stepUp(page)).toBeVisible();
  await typePin(page, 'pin', PIN);

  await expect(page).toHaveURL(new RegExp(`/interview/(${UUID})$`));
  const [, id] =
    new URL(page.url()).pathname.match(new RegExp(`^/interview/(${UUID})$`)) ??
    [];
  await expectHosted(page, `/v8/interview/${id}`);
  const replies = await settledReply(page);
  expect(replies).toEqual([
    {
      key: NON_EXTRACTABLE_DATA_KEY,
      enterAuthorized: true,
      // The new interview's row, encrypted here, read with the key handed
      // over.
      decryptedNetwork: expect.objectContaining({ nodes: [], edges: [] }),
      error: null,
    },
  ]);
  await expect(stepUp(page)).toBeHidden();
  await expect(lockScreen(page)).toBeHidden();
  // One 'ready', one answer.
  expect((await stubRecord(page)).replies).toHaveLength(1);
});

test('under a PIN lock without unlock-on-enter, resuming asks nothing and says the step was not needed', async ({
  page,
}) => {
  await openOnSecuredInterviewer8Device(page, { requireUnlockOnEnter: false });

  await resumeFromDataView(page, PIN);

  await expectHosted(page, `/v8/interview/${LEGACY_SESSION_ID}`);
  expect(await settledReply(page)).toEqual([
    {
      key: NON_EXTRACTABLE_DATA_KEY,
      enterAuthorized: false,
      decryptedNetwork: expect.objectContaining({ nodes: [] }),
      error: null,
    },
  ]);
  await expect(stepUp(page)).toHaveCount(0);
  await expect(lockScreen(page)).toHaveCount(0);
});

test('under a PIN lock, a review is handed the key that reads the finished interview', async ({
  page,
}) => {
  await openOnSecuredInterviewer8Device(page);
  await openDataView(page, PIN);
  await page.getByRole('button', { name: /^Complete ·/ }).click();
  await page.getByTestId('data-review').click();
  await expect(stepUp(page)).toBeVisible();
  await typePin(page, 'pin', PIN);

  await expectHosted(
    page,
    `/v8/interview/${LEGACY_FINISHED_SESSION_ID}?mode=review`,
  );
  const [reply] = await settledReply(page);
  expect(reply?.error).toBeNull();
  expect(
    reply?.decryptedNetwork?.nodes.map((node) => node.attributes?.nickname),
  ).toEqual([LEGACY_NODE_NICKNAME]);
});

test('reloading the hosted interview asks once, at the lock screen, and hosts it again', async ({
  page,
}) => {
  await openOnSecuredInterviewer8Device(page);
  await resumeFromDataView(page, PIN);
  await expect(stepUp(page)).toBeVisible();
  await typePin(page, 'pin', PIN);
  await expectHosted(page, `/v8/interview/${LEGACY_SESSION_ID}`);

  await page.reload();
  await expect(lockScreen(page)).toBeVisible();
  await typePin(page, 'pin', PIN);

  await expectHosted(page, `/v8/interview/${LEGACY_SESSION_ID}`);
  expect(await settledReply(page)).toEqual([
    expect.objectContaining({
      key: NON_EXTRACTABLE_DATA_KEY,
      enterAuthorized: true,
    }),
  ]);
  await expect(stepUp(page)).toHaveCount(0);
});

test('when Interviewer 8 closes, the frame goes and home shows what it wrote', async ({
  page,
}) => {
  await openOnSecuredInterviewer8Device(page, { requireUnlockOnEnter: false });
  await openDataView(page, PIN);
  await page.getByRole('button', { name: /^In progress ·/ }).click();
  await expect(page.getByText('legacy-case')).toBeVisible();
  await page.getByTestId('data-resume').first().click();
  await expectHosted(page, `/v8/interview/${LEGACY_SESSION_ID}`);

  await hostedFrame(page)
    .getByRole('button', { name: LEGACY_INTERVIEWER_STUB_FINISH })
    .click();

  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('interviewer-8-frame')).toHaveCount(0);
  await expect(legacyCard(page)).toBeVisible();
  // Not locked by it.
  await expect(lockScreen(page)).toHaveCount(0);
  // Read afresh, without a page load: Interviewer 8 finished it, so the data
  // view, reached in the app, lists it as complete.
  await page
    .getByRole('group', { name: 'Home view' })
    .getByText('Data', { exact: true })
    .click();
  await expect(page).toHaveURL('/data');
  await page.getByRole('button', { name: /^Complete ·/ }).click();
  await expect(page.getByText('legacy-case')).toBeVisible();
  await page.getByRole('button', { name: /^In progress ·/ }).click();
  await expect(page.getByText('legacy-case')).toHaveCount(0);
});

test('closing goes home with the interview’s history entry replaced, so Back does not re-enter it', async ({
  page,
}) => {
  await openOnInterviewer8Device(page);
  await resumeFromDataView(page);
  await chooseNoLock(page);
  await expectHosted(page, `/v8/interview/${LEGACY_SESSION_ID}`);

  await hostedFrame(page)
    .getByRole('button', { name: LEGACY_INTERVIEWER_STUB_CLOSE })
    .click();
  await expect(page).toHaveURL('/');

  await page.goBack();
  await expect(page).not.toHaveURL(/\/interview\//);
  await expect(page.getByTestId('interviewer-8-frame')).toHaveCount(0);
});

for (const [how, lose] of [
  ['reloads', (frame: Frame) => frame.evaluate(() => window.location.reload())],
  [
    'navigates away from Interviewer 8',
    (frame: Frame) => frame.evaluate(() => window.location.assign('/data')),
  ],
  [
    'is removed without closing',
    (frame: Frame) =>
      frame.page().evaluate(() => {
        document.querySelector('[data-testid="interviewer-8-frame"]')?.remove();
      }),
  ],
] as const) {
  test(`locks Interviewer 9 and goes home when the frame ${how}`, async ({
    page,
  }) => {
    await openOnSecuredInterviewer8Device(page, {
      requireUnlockOnEnter: false,
    });
    await resumeFromDataView(page, PIN);
    await expectHosted(page, `/v8/interview/${LEGACY_SESSION_ID}`);
    await settledReply(page);

    await lose(stubFrame(page));

    await expect(lockScreen(page)).toBeVisible();
    await expect(page).toHaveURL('/');
    await typePin(page, 'pin', PIN);
    await expect(legacyCard(page)).toBeVisible();
    await expect(page.getByTestId('interviewer-8-frame')).toHaveCount(0);

    // The entry the frame pinned was stepped over and the interview's own
    // entry replaced, so Back goes to the data view the interview was
    // resumed from, not into the interview.
    await page.goBack();
    await expect(page).toHaveURL(/\/data/);
    await expect(page.getByTestId('interviewer-8-frame')).toHaveCount(0);
  });
}

test('going back past the hosted interview without closing it locks Interviewer 9', async ({
  page,
}) => {
  await openOnSecuredInterviewer8Device(page, { requireUnlockOnEnter: false });
  await resumeFromDataView(page, PIN);
  await expectHosted(page, `/v8/interview/${LEGACY_SESSION_ID}`);
  await settledReply(page);

  // Past the frame's pin, this route's pin and the interview's entry, to the
  // data view: what Back does once Interviewer 8's own pin has gone (its error
  // screen sits above it), since this route does not re-pin while hosting.
  await page.evaluate(() => window.history.go(-3));

  await expect(page).toHaveURL(/\/data/);
  await expect(lockScreen(page)).toBeVisible();
  await typePin(page, 'pin', PIN);
  await expect(lockScreen(page)).toBeHidden();
  await expect(page.getByTestId('interviewer-8-frame')).toHaveCount(0);
});

test('when Interviewer 8 cannot be loaded into the frame, it says so and does not lock', async ({
  page,
  context,
}) => {
  await openOnSecuredInterviewer8Device(page, { requireUnlockOnEnter: false });
  await openDataView(page, PIN);
  await page.getByRole('button', { name: /^In progress ·/ }).click();
  // Offline, before Interviewer 8 has been saved for offline use: the frame's
  // page cannot load.
  await context.setOffline(true);
  await page.getByTestId('data-resume').first().click();

  await expect(
    page.getByRole('heading', { name: 'Interview unavailable' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /^Interviewer 8, which runs schema 8 protocols, has not finished downloading/,
    ),
  ).toBeVisible();
  await expect(page.getByTestId('interviewer-8-frame')).toHaveCount(0);
  await expect(lockScreen(page)).toHaveCount(0);
  await context.setOffline(false);
});

test('Interviewer 9’s idle lock does not fire while Interviewer 8 is hosted, and counts afresh after', async ({
  page,
}) => {
  await page.clock.install();
  await openOnSecuredInterviewer8Device(page, { requireUnlockOnEnter: false });
  await resumeFromDataView(page, PIN);
  await expectHosted(page, `/v8/interview/${LEGACY_SESSION_ID}`);

  // Far past set-up's 15-minute idle lock, with nothing touched here.
  await page.clock.fastForward('40:00');
  await expect(lockScreen(page)).toHaveCount(0);
  await expectHosted(page, `/v8/interview/${LEGACY_SESSION_ID}`);

  await hostedFrame(page)
    .getByRole('button', { name: LEGACY_INTERVIEWER_STUB_CLOSE })
    .click();
  await expect(page).toHaveURL('/');
  await expect(lockScreen(page)).toHaveCount(0);

  // Counting again from the close: not before the timeout, then it locks.
  await page.clock.fastForward('14:00');
  await expect(lockScreen(page)).toHaveCount(0);
  await page.clock.fastForward('02:00');
  await expect(lockScreen(page)).toBeVisible();
});

test('resetting the device deletes the shared database, schema 8 rows with it', async ({
  page,
}) => {
  await openOnInterviewer8Device(page);

  await page.getByTestId('settings-trigger').click();
  await page.getByRole('tab', { name: 'Security' }).click();
  await page.getByRole('button', { name: 'Reset device' }).click();
  await page
    .getByRole('dialog', { name: 'Reset device and wipe data?' })
    .getByRole('button', { name: 'Destroy device data' })
    .click();

  // Deleted; this app may open it again, empty, straight away.
  const stored = async () => {
    const dump = await dumpDatabase(page);
    return ['protocols', 'sessions', 'assets'].reduce(
      (total, store) => total + rowsOf(dump, store).length,
      0,
    );
  };
  await expect.poll(stored).toBe(0);

  await page.goto('/');
  await expect(page.getByTestId('protocol-import-input')).toBeAttached();
  await expect(legacyCard(page)).toHaveCount(0);
  expect(await stored()).toBe(0);
});
