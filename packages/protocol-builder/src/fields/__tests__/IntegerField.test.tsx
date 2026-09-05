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
});
