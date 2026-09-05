import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import AlterLimitsSection from '../AlterLimitsSection.tsx';

const limits = <AlterLimitsSection />;

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
  sections: limits,
};

describe('the nomination limits a name generator may set', () => {
  it('opens already switched on for a stage that has limits', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-roster-1',
      sections: limits,
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(1));
    expect(harness.outline()[0]).toEqual({
      title: 'Nomination limits',
      state: 'Finished',
    });
    expect(
      screen.getByRole('spinbutton', { name: /Fewest people/ }),
    ).toHaveValue(1);
    expect(screen.getByRole('spinbutton', { name: /Most people/ })).toHaveValue(
      8,
    );
  });

  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-roster-1',
      sections: limits,
    });

    // Everything else a roster name generator holds — its name, its type, the
    // data file it lists from, how its cards read, and what it asks — belongs
    // to sections this mount does not include.
    await harness.roundTrip({
      unowned: [
        'label',
        'subject',
        'dataSource',
        'cardOptions',
        'sortOptions',
        'searchOptions',
        'prompts',
      ],
    });
  });

  it('reports itself switched off on a stage with no limits', async () => {
    const harness = renderStageEditor(unlimitedStage);

    await waitFor(() => expect(harness.outline()).toHaveLength(1));
    expect(harness.outline()[0]).toEqual({
      title: 'Nomination limits',
      state: 'Switched off',
    });
  });

  it('records a window the researcher entered', async () => {
    const harness = renderStageEditor(unlimitedStage);

    await harness.user.click(
      screen.getByRole('switch', { name: 'Nomination limits' }),
    );
    await harness.user.type(
      await screen.findByRole('spinbutton', { name: /Fewest people/ }),
      '2',
    );
    await harness.user.type(
      screen.getByRole('spinbutton', { name: /Most people/ }),
      '5',
    );

    const request = await harness.submit();
    expect(request?.stageDocument.behaviours).toEqual({
      minNodes: 2,
      maxNodes: 5,
    });
  });

  /**
   * The window is one fact, not two numbers: a stage that must name at least
   * six people and at most two can never finish, and the schema's own refusal
   * arrives against a path long after the researcher has moved on.
   */
  it('refuses a window nothing could satisfy', async () => {
    const harness = renderStageEditor(unlimitedStage);

    await harness.user.click(
      screen.getByRole('switch', { name: 'Nomination limits' }),
    );
    await harness.user.type(
      await screen.findByRole('spinbutton', { name: /Fewest people/ }),
      '6',
    );
    await harness.user.type(
      screen.getByRole('spinbutton', { name: /Most people/ }),
      '2',
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('The maximum cannot be less than the minimum.'),
    ).toBeInTheDocument();
  });

  /**
   * The error belongs to the pair, so moving EITHER end has to clear it.
   *
   * Deliberately fixed from the other control. Field validation runs when a
   * field is touched and on submit, and a control that revalidates itself on
   * change covers the end the error is showing on whether the section's
   * sibling-revalidation effect exists or not — so a test that edited the
   * control holding the error would pass with that effect deleted, which is
   * the one thing it is here to prove.
   */
  it('clears the refusal from the other end of the window', async () => {
    const harness = renderStageEditor(unlimitedStage);

    await harness.user.click(
      screen.getByRole('switch', { name: 'Nomination limits' }),
    );
    const min = await screen.findByRole('spinbutton', {
      name: /Fewest people/,
    });
    await harness.user.type(min, '6');
    await harness.user.type(
      screen.getByRole('spinbutton', { name: /Most people/ }),
      '2',
    );
    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('The maximum cannot be less than the minimum.'),
    ).toBeInTheDocument();

    // The window becomes 1..2, which is satisfiable — and the error is on the
    // maximum, which nothing below touches.
    await harness.user.clear(min);
    await harness.user.type(min, '1');
    await waitFor(() =>
      expect(
        screen.queryByText('The maximum cannot be less than the minimum.'),
      ).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.behaviours).toEqual({
      minNodes: 1,
      maxNodes: 2,
    });
  });

  /**
   * The limits count across the whole stage, and a stage asking several
   * questions reads as though each question had its own allowance — so the
   * section says which it is, where the researcher is setting it.
   */
  it('warns that the limits cover a stage asking several questions', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'NameGenerator' as const,
        fields: {
          ...unlimitedStage.stage.fields,
          prompts: [
            { id: 'prompt-a', text: 'Who do you know?' },
            { id: 'prompt-b', text: 'Who do you talk to?' },
          ],
        },
      },
      sections: limits,
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Nomination limits' }),
    );

    expect(
      await screen.findByText('These limits cover the whole stage'),
    ).toBeInTheDocument();
  });

  it('says nothing of the sort on a stage asking one question', async () => {
    const harness = renderStageEditor(unlimitedStage);

    await harness.user.click(
      screen.getByRole('switch', { name: 'Nomination limits' }),
    );
    await screen.findByRole('spinbutton', { name: /Fewest people/ });

    expect(
      screen.queryByText('These limits cover the whole stage'),
    ).not.toBeInTheDocument();
  });

  /**
   * Switching a capability off means "this stage does not do this", and the
   * schema has no way to say "configured but disabled" — so the values go, and
   * they go as absent keys rather than as an empty `behaviours` object.
   */
  it('throws the limits away when the researcher switches them off', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-roster-1',
      sections: limits,
    });

    await harness.user.click(
      screen.getByRole('switch', { name: 'Nomination limits' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Clear limits' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('spinbutton', { name: /Fewest people/ }),
      ).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request).not.toBeNull();
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'behaviours')).toBe(
      false,
    );
  });
});
