import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Read the current DnD accessibility announcement from the live region.
 * The DnD system appends a div[role="status"][aria-live="polite"] to
 * document.body with text like "Drop target 1 of 2: Added Nodes".
 *
 * Duplicated from stage-fixture.ts (module-private there) because this
 * roster fixture lives in its own file and cannot import it.
 */
async function getDndAnnouncement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const statusElements = document.querySelectorAll(
      'body > div[role="status"][aria-live="polite"]',
    );
    for (const el of statusElements) {
      const text = el.textContent?.trim() ?? '';
      if (text.includes('Drop target')) {
        return text;
      }
    }
    return '';
  });
}

/**
 * Navigate keyboard DnD to a specific drop target by reading announcements.
 * Focuses the source (nodes use roving tabindex, so `.focus()` is unreliable
 * in WebKit — use evaluate), presses Ctrl+D to pick up, then ArrowRight until
 * the announcement matches `targetText`, and finally presses Enter to drop.
 */
async function navigateDndToTarget(
  page: Page,
  sourceLocator: Locator,
  targetText: string,
  maxSteps = 20,
): Promise<void> {
  await pickUpAndNavigate(page, sourceLocator, targetText, maxSteps);
  await page.keyboard.press('Enter');
}

/**
 * Shared pickup + navigation used by both `navigateDndToTarget` (which then
 * drops) and `NameGeneratorRosterFixture.beginRemoveDrag` (which leaves the
 * drag in flight so the drop overlay can be asserted mid-drag).
 */
async function pickUpAndNavigate(
  page: Page,
  sourceLocator: Locator,
  targetText: string,
  maxSteps = 20,
): Promise<void> {
  await sourceLocator.evaluate((el) => {
    if (el instanceof HTMLElement) {
      el.focus();
    }
  });
  await sourceLocator.press('Control+d');

  for (let i = 0; i < maxSteps; i++) {
    await page.keyboard.press('ArrowRight');
    const announcement = await getDndAnnouncement(page);
    if (announcement.includes(targetText)) {
      return;
    }
  }

  throw new Error(
    `Could not find DnD target "${targetText}" after ${maxSteps} steps`,
  );
}

/**
 * Fixture for NameGeneratorRoster stages: a searchable/sortable/filterable
 * roster (left "Available to add" panel) that participants keyboard-drag into
 * a per-prompt Added-Nodes list (right panel). Pointer drag is unreliable in
 * WebKit (setPointerCapture) so all movement goes through keyboard DnD.
 *
 * Scenarios instantiate this directly (`new NameGeneratorRosterFixture(page)`)
 * rather than via the shared StageFixture.
 */
export class NameGeneratorRosterFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Left "Available to add" panel (NameGeneratorRoster.tsx:352,377). */
  get sourceListbox(): Locator {
    return this.page.getByRole('listbox', { name: 'Available Roster Nodes' });
  }

  /** Right per-prompt NodeList (NameGeneratorRoster.tsx:422-430). */
  get addedListbox(): Locator {
    return this.page.getByRole('listbox', { name: 'Added Nodes' });
  }

  getRosterNode(label: string): Locator {
    return this.sourceListbox.getByRole('option', { name: label });
  }

  getAddedNode(label: string): Locator {
    return this.addedListbox.getByRole('option', { name: label });
  }

  /**
   * Keyboard-drag a card from the source roster into the Added Nodes list.
   * `navigateDndToTarget` presses Enter once the drop-target announcement
   * matches — do not press it again here.
   */
  async addNode(label: string): Promise<void> {
    const source = this.getRosterNode(label);
    await expect(source).toBeVisible();
    await navigateDndToTarget(this.page, source, 'Added Nodes');
    await expect(this.getAddedNode(label)).toBeVisible();
  }

  /**
   * Keyboard-drag an added node back over the source panel to remove it. The
   * source panel accepts drops from ANY added node (NameGeneratorRoster.tsx:288)
   * and re-shows the card in the source listbox under its original label.
   */
  async removeNode(label: string): Promise<void> {
    const added = this.getAddedNode(label);
    await expect(added).toBeVisible();
    await navigateDndToTarget(this.page, added, 'Available Roster Nodes');
    await expect(this.getRosterNode(label)).toBeVisible();
  }

  /**
   * Pick up an added node and navigate the keyboard-DnD cursor onto the source
   * panel WITHOUT dropping, leaving the drag in flight so the drop overlay can
   * be asserted mid-drag. Call `dropInFlight()` afterwards to complete the drop.
   */
  async beginRemoveDrag(label: string): Promise<void> {
    const added = this.getAddedNode(label);
    await expect(added).toBeVisible();
    await pickUpAndNavigate(this.page, added, 'Available Roster Nodes');
  }

  /** Complete an in-flight keyboard drag started with `beginRemoveDrag`. */
  async dropInFlight(): Promise<void> {
    await this.page.keyboard.press('Enter');
  }

  /**
   * The "Drop here to remove" overlay shown over the source panel mid-drag of
   * an added node (NameGeneratorRoster.tsx:409-417). Only visible while a drag
   * from the Added Nodes list is in flight.
   */
  get dropOverlay(): Locator {
    return this.page.getByText('Drop here to remove');
  }

  get filterInput(): Locator {
    return this.page.getByRole('searchbox', { name: 'Filter' });
  }

  async search(query: string): Promise<void> {
    await this.filterInput.fill(query);
  }

  async clearSearch(): Promise<void> {
    await this.filterInput.fill('');
  }

  /** The "N results" badge CollectionFilterInput renders once a query is active. */
  get resultsBadge(): Locator {
    return this.page.getByText(/^\d+ results?$/);
  }

  get emptyState(): Locator {
    return this.page.getByText('Nothing matched your search term.');
  }

  sortButton(label: string): Locator {
    return this.page.getByRole('button', {
      name: new RegExp(`^Sort by ${label}`),
    });
  }

  async sortBy(label: string): Promise<void> {
    await this.sortButton(label).click();
  }

  /**
   * Accessible names (card titles) of every card CURRENTLY MOUNTED in the
   * source listbox, in DOM order. The Collection is virtualized, so for large
   * rosters this only reflects the visible + overscan window — only rely on
   * this for small (<= ~10 row) fixtures where every row mounts.
   */
  async sourceLabels(): Promise<string[]> {
    const options = await this.sourceListbox.getByRole('option').all();
    const labels: string[] = [];
    for (const option of options) {
      labels.push((await option.getAttribute('aria-label')) ?? '');
    }
    return labels;
  }
}
