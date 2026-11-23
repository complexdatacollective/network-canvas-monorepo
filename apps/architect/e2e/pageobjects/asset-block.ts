import { expect, type Locator, type Page } from '@playwright/test';

import { StageEditor } from './stage-editor.js';

/**
 * The images, recordings and videos placed in a rich text as blocks, and what
 * stands beside a selected one: its settings and its resize corner.
 *
 * A block is saved as a markdown image whose address names a protocol
 * resource (`![alt](asset:<id>?size=medium)`); in the editor it is drawn as
 * the file it names, with an `img` named for its description (or, with none,
 * for its file).
 */
export class AssetBlocks {
  private readonly page: Page;
  private readonly editor: Locator;

  /** `editor` is the rich text the blocks are in: the page's by default. */
  constructor(page: Page, editor: Locator = new StageEditor(page).richText()) {
    this.page = page;
    this.editor = editor;
  }

  /** The picture of the image block (or poster) named `name`. */
  image(name: string): Locator {
    return this.editor.getByRole('img', { name });
  }

  /** The block, of all the text holds, that is the image named `name`. */
  block(name: string): Locator {
    return this.editor
      .locator('[data-asset-block]')
      .filter({ has: this.page.getByRole('img', { name, exact: true }) });
  }

  /** Every block in the text, whatever it shows. */
  blocks(): Locator {
    return this.editor.locator('[data-asset-block]');
  }

  /**
   * What changes how a selected block shows. It stands over the page beside
   * the block, and is there only while the block is selected and the
   * researcher is in the field. Named for the kind of file the block shows.
   */
  settings(kind: 'Image' | 'Video' | 'Audio' = 'Image'): Locator {
    return this.page.getByRole('dialog', { name: `${kind} settings` });
  }

  /** The settings of whichever block is selected, of any kind. */
  anySettings(): Locator {
    return this.page.getByRole('dialog', { name: /settings$/ });
  }

  /** The corner of the selected block's outline that resizes it. */
  resizeCorner(): Locator {
    return this.page.locator('[data-asset-block-resize]');
  }

  /**
   * Saves the stage from the text, as a researcher does once a block is done
   * with: the caret back in the text takes the block's settings off the page.
   */
  async saveFromText(paragraph: string): Promise<void> {
    await this.editor.locator('p', { hasText: paragraph }).click();
    await expect(this.anySettings()).toHaveCount(0);
    await new StageEditor(this.page).save();
  }
}

/**
 * Scrolls the page so that the top of `block` is `top` pixels from the top of
 * the window.
 */
export async function placeBlockAt(block: Locator, top: number): Promise<void> {
  await block.evaluate((element, wanted) => {
    let scroller: Element | null = element.parentElement;
    while (
      scroller !== null &&
      !(
        scroller.scrollHeight > scroller.clientHeight &&
        /auto|scroll/.test(getComputedStyle(scroller).overflowY)
      )
    ) {
      scroller = scroller.parentElement;
    }
    const target = scroller ?? document.scrollingElement;
    if (target === null) throw new Error('Nothing scrolls');
    target.scrollTop += element.getBoundingClientRect().top - wanted;
  }, top);
}
