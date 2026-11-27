import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from '@codaco/fresco-ui/Button';

import type { CodebookSubject } from '../../protocol-context.ts';
import { readMessage } from '../../testing/i18n.ts';
import { fixtureTypeId } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { testId, testVariableId } from '../../testing/testId.ts';
import { sectionIdForCodebookSubject } from '../editing.ts';
import {
  useCreateCodebookVariable,
  type NewCodebookVariable,
} from '../useCodebookVariableEdits.ts';

const PERSON: CodebookSubject = {
  entity: 'node',
  type: fixtureTypeId('node', 'person'),
};

/**
 * A control that asks for one attribute to be created and shows what came
 * back. The hook is what a row's save calls once its inline rules have passed,
 * so this is the only place its own refusal can be seen on its own.
 */
function CreateAttribute({
  variable,
}: Readonly<{ variable: NewCodebookVariable }>) {
  const create = useCreateCodebookVariable(PERSON);
  const [outcome, setOutcome] = useState<string>('');

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          void create(variable).then((answer) => {
            setOutcome(
              answer.status === 'refused'
                ? `refused: ${readMessage(answer.message)}`
                : answer.status,
            );
            return undefined;
          });
        }}
      >
        Create the attribute
      </Button>
      <p data-testid="outcome">{outcome}</p>
    </>
  );
}

const SEAT: NewCodebookVariable = {
  name: 'seat',
  type: 'categorical',
  component: 'CheckboxGroup',
  options: [
    {
      id: testId('option/seat/ing_x'),
      value: 'ing_x',
      label: { 'en-US': 'Ing' },
    },
    { id: testId('option/seat/row'), value: 'row', label: { 'en-US': 'Row' } },
  ],
};

describe('creating an attribute beside the codebook layouts', () => {
  it('refuses an option value whose export column is a position column of a layout', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <CreateAttribute variable={SEAT} />,
    });
    harness.receiveCodebookUpdate({
      layouts: { [testVariableId('seat_ing layout')]: { name: 'seat_ing' } },
    });
    const before = harness.host.store.read(sectionIdForCodebookSubject(PERSON));

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create the attribute' }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('outcome')).toHaveTextContent(
        'refused: Option “ing_x” of “seat” would be exported to a column called “seat_ing_x”, but the export already has a column called “seat_ing_x” for the positions in the layout “seat_ing”. Change the option value or the attribute name.',
      ),
    );
    expect(
      harness.host.store.read(sectionIdForCodebookSubject(PERSON)),
    ).toEqual(before);
  });

  it('control: creates the same attribute when no layout takes its columns', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <CreateAttribute variable={SEAT} />,
    });

    await harness.user.click(
      await screen.findByRole('button', { name: 'Create the attribute' }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('outcome')).toHaveTextContent('created'),
    );
  });
});
