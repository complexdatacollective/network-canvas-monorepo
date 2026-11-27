import {
  expect,
  informationProtocol,
  PHOTO_FILE,
  test,
} from '../fixtures/information-page.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

// The toolbar of a rich text field: the controls above the text that format
// it and insert media. Exercised on an Information stage's page, whose
// "Content" section holds the one rich text field that has all of them.

test('shows each text style in the list of them as it is set in the text', async ({
  architectPage,
  openInformationPage,
}) => {
  await openInformationPage(
    informationProtocol('# Welcome\n\nBye.'),
    PHOTO_FILE,
  );
  const editor = new StageEditor(architectPage);
  await editor.richText().locator('p', { hasText: 'Bye.' }).click();
  await editor
    .section('Content')
    .getByRole('button', { name: /^Text style:\s*Paragraph$/ })
    .click();
  const fontSize = (name: string) =>
    architectPage
      .getByRole('menuitemradio', { name, exact: true })
      .getByText(name, { exact: true })
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      );
  const paragraph = await fontSize('Paragraph');
  const heading = await fontSize('Heading 1');
  expect(heading).toBeGreaterThan(paragraph);
  // The list's own button is not a sample: it is set as the toolbar is.
  const trigger = await editor
    .section('Content')
    .getByRole('button', { name: /^Text style:/ })
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );
  expect(trigger).toBeLessThan(heading);
});

// The toolbar holds more than one line of controls at most widths. Its groups
// break across lines, so a line is filled before the next begins, and the rule
// that marks where a group starts is drawn only between two controls.
for (const width of [1280, 1024, 820, 640, 480]) {
  test(`wraps the toolbar a control at a time at ${width}px, with no rule at either end of a line`, async ({
    architectPage,
    openInformationPage,
  }) => {
    await architectPage.setViewportSize({ width, height: 720 });
    await openInformationPage(
      informationProtocol('# Welcome\n\nBye.'),
      PHOTO_FILE,
    );
    const editor = new StageEditor(architectPage);
    await expect(editor.richText()).toBeEditable();
    const toolbar = editor.section('Content').getByRole('toolbar');
    await expect(
      toolbar.getByRole('button', { name: 'Insert video', exact: true }),
    ).toBeVisible();

    const drawn = await toolbar.evaluate((bar) => {
      // The bar shows of its line of controls what is inside this box.
      const clip = bar.firstElementChild;
      if (clip === null) throw new Error('The toolbar holds nothing');
      const shown = clip.getBoundingClientRect();
      const controls = Array.from(bar.querySelectorAll('button')).map(
        (button) => {
          const box = button.getBoundingClientRect();
          // The controls sit next to each other. A group's first control is
          // one piece with the space before it, where the group's rule is
          // drawn (`data-toolbar-divider`).
          const before = button.previousElementSibling;
          const divider =
            before?.hasAttribute('data-toolbar-divider') === true
              ? before
              : undefined;
          const rule = divider?.firstElementChild?.getBoundingClientRect();
          return {
            name: button.getAttribute('aria-label') ?? button.textContent,
            left: box.left,
            right: box.right,
            middle: (box.top + box.bottom) / 2,
            space: divider?.getBoundingClientRect().width ?? 0,
            // A rule is seen where it is inside what the bar shows of itself.
            rule:
              rule !== undefined &&
              rule.width > 0 &&
              rule.right > shown.left &&
              rule.left < shown.right
                ? { left: rule.left, right: rule.right }
                : undefined,
          };
        },
      );
      const lines: (typeof controls)[] = [];
      for (const control of controls) {
        const line = lines.find(
          ([first]) =>
            first !== undefined && Math.abs(first.middle - control.middle) < 4,
        );
        if (line === undefined) lines.push([control]);
        else line.push(control);
      }
      // The bar's own padding is where the focus ring of a control at its
      // edge is drawn; its controls run from one side of that to the other.
      const padding = Number.parseFloat(getComputedStyle(clip).paddingLeft);
      return {
        start: shown.left + padding,
        end: shown.right - padding,
        lines: lines.map((line) => line.toSorted((a, b) => a.left - b.left)),
      };
    });

    expect(drawn.lines.length).toBeGreaterThan(1);
    for (const [index, line] of drawn.lines.entries()) {
      const names = line.map((control) => control.name).join(', ');
      const first = line[0];
      const last = line.at(-1);
      if (first === undefined || last === undefined) continue;
      // The line begins at the bar's edge, with a control and not a rule.
      expect(first.left, names).toBeCloseTo(drawn.start, 0);
      // Every rule seen has a control on each side of it, on its own line.
      for (const { rule, name } of line) {
        if (rule === undefined) continue;
        expect(
          line.some((control) => control.right <= rule.left + 0.5),
          `a control before the rule at "${name}"`,
        ).toBe(true);
        expect(
          line.some((control) => control.left >= rule.right - 0.5),
          `a control after the rule at "${name}"`,
        ).toBe(true);
      }
      // And the line is full: the control that begins the next one, with the
      // space before it, would not have fitted at the end of this one.
      const next = drawn.lines[index + 1]?.[0];
      if (next !== undefined) {
        expect(
          last.right + next.space + (next.right - next.left),
          `"${next.name}" after "${last.name}"`,
        ).toBeGreaterThan(drawn.end);
      }
    }
  });
}
