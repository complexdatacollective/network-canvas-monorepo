import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The two menus on the toolbar of a text that can show values the interview
 * fills in: the syringe ("Inject piped text …"), which lists the values the
 * text can show, and "Insert logic", which lists wording that depends on one.
 * Both are searchable lists in a popover named like their button.
 *
 * A text is found by the name of its rich-text box, within the field that
 * holds it, so the toolbar, language menu and pills belong to that text and no
 * other on the page.
 */
export class PipedText {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  field(label: string): Locator {
    return this.page.locator('[data-field-name]').filter({
      has: this.page.getByRole('textbox', { name: label, exact: true }),
    });
  }

  /** The text's own box, not the boxes of the versions inside it. */
  textbox(label: string): Locator {
    return this.field(label).getByRole('textbox', { name: label, exact: true });
  }

  /** Puts the caret at the end of the text. */
  async focusEnd(label: string): Promise<void> {
    await this.textbox(label).click();
    await this.page.keyboard.press('End');
  }

  valuesButton(label: string): Locator {
    return this.field(label).getByRole('button', {
      name: /^Inject piped text/,
    });
  }

  logicButton(label: string): Locator {
    return this.field(label).getByRole('button', {
      name: 'Insert logic',
      exact: true,
    });
  }

  /** The popover of whichever menu is open. */
  menu(): Locator {
    return this.page.getByRole('dialog', {
      name: /^(Inject piped text|Insert logic)/,
    });
  }

  menuOptions(): Locator {
    return this.menu().getByRole('option');
  }

  /** Narrows the open menu to the entries matching `text`. */
  async search(text: string): Promise<void> {
    await this.menu().getByRole('combobox', { name: 'Search' }).fill(text);
  }

  async openValues(label: string): Promise<void> {
    await this.valuesButton(label).click();
    await expect(this.menu()).toBeVisible();
  }

  async openLogic(label: string): Promise<void> {
    await this.logicButton(label).click();
    await expect(this.menu()).toBeVisible();
  }

  /** Inserts a value at the caret by choosing it in the syringe menu. */
  async insertValue(label: string, entry: string | RegExp): Promise<void> {
    await this.openValues(label);
    await this.menu().getByRole('option', { name: entry }).click();
    await expect(this.menu()).toBeHidden();
  }

  /** Inserts wording that depends on a value, from the "Insert logic" menu. */
  async insertLogic(label: string, entry: string | RegExp): Promise<void> {
    await this.openLogic(label);
    await this.menu().getByRole('option', { name: entry }).click();
    await expect(this.menu()).toBeHidden();
  }

  /**
   * Inserts a value the way a keyboard user does: the `{` key opens the menu
   * at the caret, typing narrows it and Enter chooses the first match.
   */
  async insertValueByKeyboard(search: string): Promise<void> {
    await this.page.keyboard.type('{');
    await expect(this.menu()).toBeVisible();
    await this.search(search);
    await this.page.keyboard.press('Enter');
    await expect(this.menu()).toBeHidden();
  }

  /** A folded value or wording in the text, shown as a button named for it. */
  pill(label: string, name: string): Locator {
    return this.field(label).getByRole('button', { name, exact: true });
  }

  /** The boxes of a block of versions, named by the heading of each. */
  versions(label: string, group: string | RegExp): Locator {
    return this.field(label)
      .getByRole('group', { name: group })
      .getByRole('textbox');
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
