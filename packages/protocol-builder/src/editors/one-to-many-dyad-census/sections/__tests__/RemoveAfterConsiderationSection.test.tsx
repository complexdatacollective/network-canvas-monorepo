import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../../testing/renderStageEditor.tsx';
import RemoveAfterConsiderationSection from '../RemoveAfterConsiderationSection.tsx';

const openSection = () => ({
  stageId: 'one-to-many-dyad-census-1' as const,
  sections: <RemoveAfterConsiderationSection />,
});

describe('what becomes of a person already considered', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openSection());

    await harness.roundTrip({ unowned: ['label', 'subject', 'prompts'] });
  });

  /**
   * Not a capability: the schema requires an answer either way, so both are
   * offered as choices rather than one being a switch with an implied default.
   */
  it('shows the answer the stage was saved with, and offers the other', async () => {
    renderStageEditor(openSection());

    expect(
      await screen.findByRole('radio', { name: 'Remove them from the list' }),
    ).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Keep them in the list' }),
    ).not.toBeChecked();
  });

  it('saves the other answer when the researcher chooses it', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      await screen.findByRole('radio', { name: 'Keep them in the list' }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.behaviours).toEqual({
      removeAfterConsideration: false,
    });
  });

  /**
   * A stage that does not say is a stage the schema refuses, so the refusal
   * has to arrive here rather than as `stages.N.behaviours` from the save.
   */
  it('refuses a stage that answers neither way, and says which section', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'OneToManyDyadCensus',
        fields: {
          label: 'One to Many Dyad Census',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ id: 'prompt-a', text: 'Who?', createEdge: 'knows' }],
        },
      },
      sections: <RemoveAfterConsiderationSection />,
    });

    expect(await harness.submit()).toBeNull();
    await waitFor(() =>
      expect(
        harness
          .outline()
          .find((section) => section.title === 'Node availability')?.state,
      ).toBe('Has a problem'),
    );
  });
});

/**
 * The same section read in Spanish.
 *
 * The cases above mount no provider, so they render this section's English
 * `defaultMessage`s and their assertions stand unchanged. This is the one that
 * mounts one, and it exists to prove the wiring rather than the words.
 *
 * Both answers are asserted as well as the heading: they are the one place in
 * this section where words travel through a prop of the control rather than
 * through the section's own markup, so a section named in Spanish and answered
 * in English would fail here rather than pass halfway.
 */
describe('the node availability section, read in Spanish', () => {
  it('names the section, its question and both of its answers', async () => {
    const harness = renderStageEditor({
      stageId: 'one-to-many-dyad-census-1',
      locale: 'es',
      sections: <RemoveAfterConsiderationSection />,
    });

    await waitFor(() => expect(harness.outline()).toHaveLength(1));
    expect(harness.outline()[0]?.title).toBe('Disponibilidad de nodos');
    expect(
      screen.getByText(
        'Elige si un nodo focal sigue disponible después de evaluarlo.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'Quitarla de la lista' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'Mantenerla en la lista' }),
    ).toBeInTheDocument();
  });
});
