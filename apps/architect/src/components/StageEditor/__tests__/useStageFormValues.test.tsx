import { fireEvent, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import { useStageFormValues } from '../useStageFormValues';
import { asStage, renderStageForm } from './stageFormTestHarness';

const committedStage = asStage({
  id: 'stage-1',
  type: 'Information',
  label: 'Stage one',
});

const Fields = () => (
  <>
    <Field
      name="label"
      label="Label"
      component={InputField}
      initialValue="Stage one"
    />
    <Field
      name="introductionPanel.title"
      label="Panel title"
      component={InputField}
      initialValue="Panel"
    />
  </>
);

const WholeValuesConsumer = () => {
  const values = useStageFormValues();
  return <span data-testid="whole">{JSON.stringify(values)}</span>;
};

const SelectedValuesConsumer = () => {
  const values = useStageFormValues(['introductionPanel.title']);
  const renders = useRef(0);
  renders.current += 1;
  const title = values['introductionPanel.title'];

  return (
    <>
      <span data-testid="selected">
        {typeof title === 'string' ? title : ''}
      </span>
      <span data-testid="selected-renders">{renders.current}</span>
    </>
  );
};

const setValue = (name: string, value: string) => {
  fireEvent.change(screen.getByRole('textbox', { name }), {
    target: { value },
  });
};

describe('useStageFormValues', () => {
  it('returns the assembled form values and tracks changes', () => {
    renderStageForm({
      committedStage,
      children: (
        <>
          <Fields />
          <WholeValuesConsumer />
        </>
      ),
    });

    expect(JSON.parse(screen.getByTestId('whole').textContent!)).toEqual({
      label: 'Stage one',
      introductionPanel: { title: 'Panel' },
    });

    setValue('Panel title', 'Updated');

    expect(JSON.parse(screen.getByTestId('whole').textContent!)).toEqual({
      label: 'Stage one',
      introductionPanel: { title: 'Updated' },
    });
  });

  it('reads selected paths without re-rendering on unrelated edits', () => {
    renderStageForm({
      committedStage,
      children: (
        <>
          <Fields />
          <SelectedValuesConsumer />
        </>
      ),
    });

    expect(screen.getByTestId('selected')).toHaveTextContent('Panel');
    const initialRenders = Number(
      screen.getByTestId('selected-renders').textContent,
    );

    setValue('Label', 'Stage two');
    expect(Number(screen.getByTestId('selected-renders').textContent)).toBe(
      initialRenders,
    );

    setValue('Panel title', 'Updated');
    expect(screen.getByTestId('selected')).toHaveTextContent('Updated');
    expect(
      Number(screen.getByTestId('selected-renders').textContent),
    ).toBeGreaterThan(initialRenders);
  });
});
