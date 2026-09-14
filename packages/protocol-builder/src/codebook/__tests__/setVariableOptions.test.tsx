import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from '@codaco/fresco-ui/Button';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { CodebookSubject } from '../../protocol-context.ts';
import { readMessage } from '../../testing/i18n.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { useSetVariableOptions } from '../useCodebookVariableEdits.ts';

/**
 * The type the family pedigree describes, whose `biologicalSex` values that
 * interface owns: the genetics engine and the interview both branch on the
 * exact strings, so the list is not the researcher's however the attribute is
 * reached.
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
    label: 'Intersex or a variation in sex characteristics',
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
): Promise<{
  harness: ReturnType<typeof renderStageEditor>;
  outcome: () => string;
  before: unknown;
}> => {
  const harness = renderStageEditor({
    stageId: 'family-pedigree-1',
    sections: (
      <WriteOptions
        subject={FAMILY_MEMBER}
        variableId={variableId}
        options={options}
      />
    ),
  });
  const before = harness.host.store.read(familyMemberSection);
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
      'biologicalSex',
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
    const { harness, outcome, before } = await write('biologicalSex', [
      { value: 'female', label: 'Female' },
      { value: 'male', label: 'Male' },
      {
        value: 'intersex',
        label: 'Intersex or a variation in sex characteristics',
      },
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
});
