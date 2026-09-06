import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import RemoveAfterConsiderationSection from '../RemoveAfterConsiderationSection.tsx';

/**
 * What becomes of a person already considered, read in Spanish.
 *
 * The rest of this section's suite mounts no provider, so it renders its
 * English `defaultMessage`s and the existing English assertions stand
 * unchanged. This is the test that mounts one, and it exists to prove the
 * wiring rather than the words.
 *
 * The two answers are asserted as well as the heading: they are the one place
 * in this section where words travel through a prop of the control rather than
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
        'Decide qué ocurre con una persona una vez que el participante ha terminado de evaluarla.',
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
