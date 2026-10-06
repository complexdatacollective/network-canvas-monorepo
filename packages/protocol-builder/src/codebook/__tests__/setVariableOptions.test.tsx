import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from '@codaco/fresco-ui/Button';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { CodebookSubject } from '../../protocol-context.ts';
import { readMessage } from '../../testing/i18n.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { sectionIdForCodebookSubject } from '../editing.ts';
import { useSetVariableOptions } from '../useCodebookVariableEdits.ts';

/**
 * The type the family pedigree describes, whose `sexAssignedAtBirth` values
 * that interface owns: the interview branches on the exact strings, so the
 * list is not the researcher's however the attribute is reached.
 */
const FAMILY_MEMBER: CodebookSubject = {
  entity: 'node',
  type: 'family_member',
};

/** The canonical set, plus one value the pedigree does not know. */
const WITH_AN_EXTRA_VALUE = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  {
    value: 'intersex',
    label: 'Intersex',
  },
  { value: 'unknown', label: 'Don’t know' },
  { value: 'preferNotToSay', label: 'Prefer not to say' },
  { value: 'other', label: 'Something else' },
];

/**
 * A control that asks for one options write and shows what came back.
 *
 * The hook is what every row's save calls, and the two answers below are ones
 * no row can produce on screen: they are the belt a stale draft meets, and the
 * only place to ask for them is the hook itself.
 */
function WriteOptions({
  subject,
  variableId,
  options,
}: Readonly<{
  subject: CodebookSubject;
  variableId: string;
  options: unknown;
}>) {
  const setOptions = useSetVariableOptions();
  const [outcome, setOutcome] = useState<string>('');

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          void setOptions(subject, variableId, options).then((answer) => {
            setOutcome(
              answer.status === 'refused'
                ? // The refusal crosses a string-only contract encoded, as
                  // every codebook refusal does, so it is read back the way
                  // the surface that renders it reads it.
                  `refused: ${readMessage(answer.message)}`
                : answer.status,
            );
          });
        }}
      >
        Write the values
      </Button>
      <p data-testid="outcome">{outcome}</p>
    </>
  );
}

const familyMemberSection = sectionId({
  kind: 'codebookNode',
  typeId: 'family_member',
});

const write = async (
  variableId: string,
  options: unknown,
  subject: CodebookSubject = FAMILY_MEMBER,
  stageId: 'family-pedigree-1' | 'name-generator-1' = 'family-pedigree-1',
): Promise<{
  harness: ReturnType<typeof renderStageEditor>;
  outcome: () => string;
  before: unknown;
}> => {
  const harness = renderStageEditor({
    stageId,
    sections: (
      <WriteOptions
        subject={subject}
        variableId={variableId}
        options={options}
      />
    ),
  });
  const before = harness.host.store.read(sectionIdForCodebookSubject(subject));
  await harness.user.click(
    await screen.findByRole('button', { name: 'Write the values' }),
  );
  return {
    harness,
    outcome: () => screen.getByTestId('outcome').textContent ?? '',
    before,
  };
};

describe('writing the answers an attribute offers', () => {
  /**
   * The refusal the package has carried since the pedigree family landed and
   * nothing called: a list an interface owns is not written, whatever asks.
   */
  it('refuses a list an interface owns, and writes nothing', async () => {
    const { harness, outcome, before } = await write(
      'sexAssignedAtBirth',
      WITH_AN_EXTRA_VALUE,
    );

    await waitFor(() =>
      expect(outcome()).toBe(
        'refused: These options are set by the interface that uses this attribute and cannot be changed here. Reopen this row to start from the current options.',
      ),
    );
    expect(harness.host.store.read(familyMemberSection)).toEqual(before);
  });

  /** An unchanged list is not a revision anybody has to merge. */
  it('writes nothing when the list already matches', async () => {
    const { harness, outcome, before } = await write('sexAssignedAtBirth', [
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
      { value: 'intersex', label: 'Intersex' },
      { value: 'unknown', label: 'Don’t know' },
      { value: 'preferNotToSay', label: 'Prefer not to say' },
    ]);

    await waitFor(() => expect(outcome()).toBe('unchanged'));
    expect(harness.host.store.read(familyMemberSection)).toEqual(before);
  });

  /** And an attribute a collaborator deleted is said to be gone. */
  it('refuses an attribute the codebook no longer holds', async () => {
    const { harness, outcome, before } = await write('neverExisted', [
      { value: 'one', label: 'One' },
      { value: 'two', label: 'Two' },
    ]);

    await waitFor(() =>
      expect(outcome()).toBe(
        'refused: This attribute is no longer in the codebook. Choose another one.',
      ),
    );
    expect(harness.host.store.read(familyMemberSection)).toEqual(before);
  });

  it('says a list of one value is too short to hold, and writes nothing', async () => {
    const knows: CodebookSubject = { entity: 'edge', type: 'knows' };
    const { harness, outcome, before } = await write(
      'closeness',
      [{ value: 1, label: 'Some' }],
      knows,
    );

    await waitFor(() =>
      expect(outcome()).toBe(
        'refused: Requires a minimum of two options. If you need fewer options, consider using a boolean attribute.',
      ),
    );
    expect(harness.host.store.read(sectionIdForCodebookSubject(knows))).toEqual(
      before,
    );
  });

  /**
   * The pedigree manages the gender identity options, because the words each
   * takes live on the stage. Another stage's editor may not write them, and a
   * refused write changes nothing.
   */
  describe('a list a stage manages', () => {
    const WITH_A_NEW_OPTION = [
      { value: 'woman', label: 'Woman' },
      { value: 'man', label: 'Man' },
      { value: 'agender', label: 'Agender' },
    ];

    it('is refused from another stage’s editor, naming the stage that manages it', async () => {
      const { harness, outcome, before } = await write(
        'genderIdentity',
        WITH_A_NEW_OPTION,
        FAMILY_MEMBER,
        'name-generator-1',
      );

      await waitFor(() =>
        expect(outcome()).toBe(
          'refused: These options are managed by the “Family Pedigree” stage, which decides the kin words each one takes. Edit them there.',
        ),
      );
      expect(harness.host.store.read(familyMemberSection)).toEqual(before);
    });

    it('is written from the editor of the stage that manages it', async () => {
      const { harness, outcome } = await write(
        'genderIdentity',
        WITH_A_NEW_OPTION,
      );

      await waitFor(() => expect(outcome()).toBe('written'));
      const variables = harness.protocolSections()[familyMemberSection]
        ?.variables as Record<string, { options?: unknown }> | undefined;
      expect(variables?.genderIdentity?.options).toEqual(WITH_A_NEW_OPTION);
    });

    it('leaves another attribute of the same type editable', async () => {
      const { outcome } = await write(
        'sexAssignedAtBirth',
        [
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
          { value: 'intersex', label: 'Intersex' },
          { value: 'unknown', label: 'Don’t know' },
          { value: 'preferNotToSay', label: 'Prefer not to say' },
        ],
        FAMILY_MEMBER,
        'name-generator-1',
      );

      // Not managed by the stage (it has its own interface-owned set), so the
      // managed-options refusal is not the answer: this list is unchanged.
      await waitFor(() => expect(outcome()).toBe('unchanged'));
    });
  });
});
