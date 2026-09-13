import type { renderStageEditor } from '../../testing/renderStageEditor.tsx';

type Harness = ReturnType<typeof renderStageEditor>;

/**
 * Puts text into a box, the way a researcher writing a protocol puts it there:
 * they compose the wording somewhere and paste it in.
 *
 * Both are real actions, and the difference between them is what a test
 * spends. `user.type` presses one key per character and waits a turn of the
 * event loop for each — a paragraph of introduction costs ten times what the
 * behaviour under test does, and every one of those keystrokes re-renders the
 * editor around it. A stage editor test is about what reaches the stage, so
 * the cheaper real action is the right one.
 *
 * Where the KEYSTROKES are the behaviour, the test still types: a proposed
 * stage name that must stop being proposed once the researcher types over it,
 * a count read as it is entered. Those are about what each keystroke does, and
 * a paste would prove none of it.
 *
 * Cleared first, so this REPLACES rather than appends: a box a stage arrived
 * with holds something, and a paste at the caret would leave the two joined.
 */
export async function writeInto(
  harness: Harness,
  control: HTMLElement,
  text: string,
): Promise<void> {
  await harness.user.clear(control);
  await harness.user.paste(text);
}
