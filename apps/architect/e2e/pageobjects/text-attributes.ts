import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The attributes in a text that participants read: the toolbar's
 * "Attribute" button and the `{` key, which open the "Insert an attribute"
 * menu of the values the text can show; the dialog that creates a dynamic
 * attribute from that menu; and the popover that a dynamic attribute's pill
 * opens, where it is edited or removed from the text.
 *
 * A text is found by the name of its rich text box, within the field that
 * holds it, so the toolbar, language menu and pills belong to that text and
 * no other on the page.
 */
export class TextAttributes {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  field(label: string): Locator {
    return this.page.locator('[data-field-name]').filter({
      has: this.page.getByRole('textbox', { name: label, exact: true }),
    });
  }

  textbox(label: string): Locator {
    return this.field(label).getByRole('textbox', { name: label, exact: true });
  }

  /** Puts the caret at the end of the text. */
  async focusEnd(label: string): Promise<void> {
    await this.textbox(label).click();
    await this.page.keyboard.press('End');
  }

  attributeButton(label: string): Locator {
    return this.field(label).getByRole('button', {
      name: 'Attribute',
      exact: true,
    });
  }

  menu(): Locator {
    return this.page.getByRole('dialog', {
      name: 'Insert an attribute',
      exact: true,
    });
  }

  menuOptions(): Locator {
    return this.menu().getByRole('option');
  }

  /** The options of one group of the menu, such as "Ego attributes". */
  menuGroup(name: string): Locator {
    return this.menu().getByRole('group', { name, exact: true });
  }

  /** Narrows the open menu to the entries matching `text`. */
  async search(text: string): Promise<void> {
    await this.menu()
      .getByRole('combobox', { name: 'Find an attribute' })
      .fill(text);
  }

  async openMenu(label: string): Promise<void> {
    await this.attributeButton(label).click();
    await expect(this.menu()).toBeVisible();
  }

  /** Inserts an entry of the menu at the caret, chosen by click. */
  async insert(label: string, entry: string | RegExp): Promise<void> {
    await this.openMenu(label);
    await this.menu().getByRole('option', { name: entry }).click();
    await expect(this.menu()).toBeHidden();
  }

  /**
   * Inserts an entry the way a keyboard user does: the `{` key opens the
   * menu at the caret, typing narrows it and Enter chooses the first match.
   */
  async insertByKeyboard(search: string): Promise<void> {
    // A keyboard user's pointer is not over the menu, which would move its
    // highlight.
    await this.page.mouse.move(0, 0);
    await this.page.keyboard.type('{');
    await expect(this.menu()).toBeVisible();
    await this.search(search);
    await this.page.keyboard.press('Enter');
    await expect(this.menu()).toBeHidden();
  }

  /** The pills in the text, one for each value it shows. */
  pills(label: string): Locator {
    return this.textbox(label).locator('[data-inline-value]');
  }

  /**
   * The name that each pill in the text shows, in order. The pill's text
   * also carries a description for screen readers, so the name is read from
   * the pill's own `value`.
   */
  async expectPills(label: string, names: readonly string[]): Promise<void> {
    const pills = this.pills(label).locator('data.variable-pill');
    await expect(pills).toHaveCount(names.length);
    for (const [index, name] of names.entries()) {
      await expect(pills.nth(index)).toHaveAttribute('value', name);
    }
  }

  createDialog(): Locator {
    return this.page.getByRole('dialog', {
      name: 'Create a dynamic attribute',
      exact: true,
    });
  }

  popover(): Locator {
    return this.page.getByRole('dialog', {
      name: 'Dynamic attribute',
      exact: true,
    });
  }

  /** Chooses how a dynamic attribute decides its version, in `within`. */
  async chooseLogic(within: Locator, logic: string): Promise<void> {
    await within.getByRole('combobox', { name: 'Logic' }).click();
    await this.page.getByRole('option', { name: logic, exact: true }).click();
    await expect(within.getByRole('combobox', { name: 'Logic' })).toHaveText(
      logic,
    );
  }

  /**
   * Creates a dynamic attribute at the caret with "Create dynamic attribute"
   * in the Attribute menu: `fill` sets its logic and writes its versions.
   */
  async createDynamicAttribute(
    label: string,
    fill: (dialog: Locator) => Promise<void>,
  ): Promise<void> {
    await this.insert(label, 'Create dynamic attribute');
    const dialog = this.createDialog();
    await expect(dialog).toBeVisible();
    await fill(dialog);
    await dialog
      .getByRole('button', { name: 'Create dynamic attribute', exact: true })
      .click();
    await expect(dialog).toBeHidden();
  }

  languageButton(label: string): Locator {
    return this.field(label).getByRole('button', { name: /^Editing language/ });
  }

  async editIn(label: string, language: string): Promise<void> {
    await this.languageButton(label).click();
    await this.page
      .getByRole('menuitemradio', { name: new RegExp(`^${language}\\b`) })
      .click();
    await expect(this.languageButton(label)).toHaveAccessibleName(
      `Editing language ${language}`,
    );
  }
}
