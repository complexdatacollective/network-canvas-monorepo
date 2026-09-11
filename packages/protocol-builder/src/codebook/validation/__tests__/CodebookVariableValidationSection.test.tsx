import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CodebookSubject } from '../../../protocol-context.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import CodebookVariableValidationSection from '../CodebookVariableValidationSection.tsx';

const EGO: CodebookSubject = { entity: 'ego' };
const PERSON: CodebookSubject = { entity: 'node', type: 'person' };

/**
 * The section over one attribute, inside a stage editor.
 *
 * It reads the codebook and writes to it under the stage editor's own host, so
 * it is mounted the way every other section is rather than rendered bare: the
 * point of the surface is that the write reaches the protocol.
 */
const open = (subject: CodebookSubject, variableId: string | undefined) =>
  renderStageEditor({
    stageId: 'ego-form-1',
    sections: (
      <CodebookVariableValidationSection
        subject={subject}
        variableId={variableId}
      />
    ),
  });

const egoValidation = (
  harness: StageEditorHarness,
  variableId: string,
): unknown =>
  Reflect.get(
    harness.hostCodebook().ego?.variables?.[variableId] ?? {},
    'validation',
  );

describe('the rules one codebook attribute’s answers have to satisfy', () => {
  /**
   * Every participant answers a question about themselves exactly once, so
   * there is no second answer for one of theirs to be unique against — the
   * schema's own mask says so, and Architect drops the rule for ego too.
   */
  it('does not offer uniqueness for the participant’s own attributes', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );

    expect(
      await screen.findByRole('checkbox', { name: 'Required' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Minimum length' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Must be unique' }),
    ).not.toBeInTheDocument();
  });

  it('writes a rule to the attribute it was asked about', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'Required' }),
    );

    await waitFor(() =>
      expect(egoValidation(harness, 'ego_name')).toEqual({ required: true }),
    );
  });

  /**
   * Nothing to be ruled is nothing to say: a field with no attribute chosen,
   * or one still holding an attribute a collaborator has deleted, has its own
   * message about that and a rule section beside it would be a second, worse
   * explanation of the same thing.
   */
  it('renders nothing without an attribute to be about', async () => {
    const harness = open(EGO, undefined);

    // The editor is on screen and its lock answered, so nothing here is
    // waiting on a render that has not happened yet.
    await harness.opened();
    expect(
      screen.queryByRole('switch', { name: 'Validation' }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing for an attribute the codebook does not have', async () => {
    const harness = open(PERSON, 'deleted-attribute');

    await harness.opened();
    expect(
      screen.queryByRole('switch', { name: 'Validation' }),
    ).not.toBeInTheDocument();
  });
});
