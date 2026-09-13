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
const open = (
  subject: CodebookSubject,
  variableId: string | undefined,
  options: Readonly<{ readOnly?: true }> = {},
) =>
  renderStageEditor({
    stageId: 'ego-form-1',
    ...options,
    sections: (
      <CodebookVariableValidationSection
        subject={subject}
        variableId={variableId}
      />
    ),
  });

/** A node type holding one attribute of the kind given, and nothing else. */
const personHolding = (type: string) => ({
  node: {
    person: {
      name: 'person',
      color: 'node-color-seq-1',
      icon: 'add-a-person',
      shape: { default: 'circle' },
      variables: {
        story: {
          name: 'story',
          type,
          component: type === 'text' ? 'Text' : 'Number',
        },
      },
    },
  },
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
      await screen.findByRole('checkbox', { name: 'Required answer' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Minimum text length' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Unique value' }),
    ).not.toBeInTheDocument();
  });

  it('writes a rule to the attribute it was asked about', async () => {
    const harness = open(EGO, 'ego_name');

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'Required answer' }),
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

  /**
   * A rule switched on but not yet answered is held on screen rather than in
   * the codebook, so nothing about a COLLABORATOR changing the kind of answer
   * takes it away. Left where it was it is a rule the new kind's rows do not
   * draw and the schema will not accept, so every later change is refused over
   * a row nobody can see and the section silently stops writing anything.
   */
  it('drops a half-set rule the new kind of answer has no room for', async () => {
    const harness = open(PERSON, 'story');
    harness.receiveCodebookUpdate(personHolding('text'));

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );
    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'Minimum text length' }),
    );

    harness.receiveCodebookUpdate(personHolding('number'));
    await waitFor(() =>
      expect(
        screen.queryByRole('checkbox', { name: 'Minimum text length' }),
      ).not.toBeInTheDocument(),
    );

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'Required answer' }),
    );

    await waitFor(() =>
      expect(
        Reflect.get(
          harness.hostCodebook().node?.person?.variables?.story ?? {},
          'validation',
        ),
      ).toEqual({ required: true }),
    );
  });

  /**
   * The rules are the codebook's, but the gesture that changes them is made
   * inside a stage this researcher may only be reading — and a spectator who
   * could still clear an attribute's rules would be writing to the protocol
   * from a surface that told them they could not.
   */
  it('offers no change on a stage this researcher may only read', async () => {
    const harness = open(EGO, 'ego_name', { readOnly: true });

    await harness.opened();
    expect(
      await screen.findByRole('switch', { name: 'Validation' }),
    ).toBeDisabled();
  });

  it('renders nothing for an attribute the codebook does not have', async () => {
    const harness = open(PERSON, 'deleted-attribute');

    await harness.opened();
    expect(
      screen.queryByRole('switch', { name: 'Validation' }),
    ).not.toBeInTheDocument();
  });
});
