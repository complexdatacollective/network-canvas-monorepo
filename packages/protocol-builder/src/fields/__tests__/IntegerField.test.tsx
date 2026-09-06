import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AlterLimitsSection from '../../sections/AlterLimitsSection.tsx';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

/**
 * Mounted through a section that counts something rather than on its own: the
 * control is a whole number held in a stage document, and what it does to the
 * document is half of what it is for.
 */
const unlimitedStage = {
  stage: {
    type: 'NameGenerator' as const,
    fields: {
      label: 'Name Generator',
      subject: { entity: 'node', type: 'person' },
      form: {
        title: 'Add a person',
        fields: [{ variable: 'name', prompt: 'Name?' }],
      },
      prompts: [{ id: 'prompt-a', text: 'Who do you know?' }],
    },
  },
  sections: <AlterLimitsSection />,
};

const openLimits = async () => {
  const harness = renderStageEditor(unlimitedStage);
  await harness.user.click(
    screen.getByRole('switch', { name: 'Nomination limits' }),
  );
  return {
    harness,
    max: await screen.findByRole('spinbutton', { name: /Most people/ }),
    min: screen.getByRole('spinbutton', { name: /Fewest people/ }),
  };
};

describe('a control that counts people', () => {
  /**
   * The control is rendered from the value it reported, so reporting a
   * part-typed number as "no answer" emptied the box under the researcher's
   * cursor: "2.5" lost its own last character the moment the decimal point
   * arrived, and typing a limit became impossible.
   */
  it('keeps what the researcher typed while it is not yet a whole number', async () => {
    const { harness, max } = await openLimits();

    await harness.user.type(max, '2.5');

    expect(max).toHaveValue(2.5);
  });

  it('says a whole number is what it wants', async () => {
    const { harness, max } = await openLimits();

    await harness.user.type(max, '2.5');

    expect(
      await screen.findByText('This has to be a whole number of people.'),
    ).toBeInTheDocument();
  });

  /**
   * And nothing part-typed reaches the document: `NaN` is refused by every
   * schema and explained by no message, and `2.5` people is not a count.
   */
  it('writes the whole number the researcher settled on, and nothing before it', async () => {
    const { harness, max } = await openLimits();

    await harness.user.type(max, '2.5');
    await harness.user.clear(max);
    await harness.user.type(max, '3');

    await waitFor(() =>
      expect(
        screen.queryByText('This has to be a whole number of people.'),
      ).not.toBeInTheDocument(),
    );
    const request = await harness.submit();
    expect(request?.stageDocument.behaviours).toEqual({ maxNodes: 3 });
  });

  /**
   * The refusal has to be able to refuse. A message the researcher can read
   * while the save goes through anyway is worse than no message: it says the
   * count was rejected, and the stage is saved without it.
   *
   * Nothing reaching the session is the half that says WHOSE refusal it was.
   * Text the section lets through is refused a step later by the schema —
   * "expected number, received string", against a path — and by then the
   * editor has already written it into the session and taken it back.
   */
  it('refuses the save while it is holding text it could not read', async () => {
    const { harness, max } = await openLimits();

    await harness.user.type(max, '2.5');

    expect(await harness.submit()).toBeNull();
    expect(harness.pendingCommands()).toHaveLength(0);
    expect(
      await screen.findAllByText('This has to be a whole number of people.'),
    ).not.toHaveLength(0);
  });

  /**
   * And it refuses rather than saving the count the researcher was editing as
   * deleted. Typing over a limit is not asking for the limit to go.
   */
  it('does not delete a saved maximum that has been part-typed over', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'NameGenerator' as const,
        fields: {
          ...unlimitedStage.stage.fields,
          behaviours: { maxNodes: 25 },
        },
      },
      sections: <AlterLimitsSection />,
    });
    const max = await screen.findByRole('spinbutton', { name: /Most people/ });
    expect(max).toHaveValue(25);

    await harness.user.clear(max);
    await harness.user.type(max, '2.5');
    expect(await harness.submit()).toBeNull();
    expect(harness.pendingCommands()).toHaveLength(0);

    // Nothing was saved, so the researcher can still put back the count they
    // were editing.
    await harness.user.clear(max);
    await harness.user.type(max, '25');
    const request = await harness.submit();
    expect(request?.stageDocument.behaviours).toEqual({ maxNodes: 25 });
  });

  /**
   * Leaving the field is not the researcher withdrawing what they typed. The
   * old control emptied the box on blur and took the explanation with it, so
   * the count vanished with nothing on screen saying it had.
   */
  it('keeps the text it could not read when the researcher leaves the field', async () => {
    const { harness, max, min } = await openLimits();

    await harness.user.type(max, '2.5');
    await harness.user.click(min);

    expect(max).toHaveValue(2.5);
    expect(
      await screen.findAllByText('This has to be a whole number of people.'),
    ).not.toHaveLength(0);
  });
});
