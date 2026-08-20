import { act } from '@testing-library/react';
import { describe, expect, expectTypeOf, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import {
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
  useSubject,
} from '../stageFormHooks';
import { asStage, renderStageForm } from './stageFormTestHarness';

type Probe = {
  value: unknown;
  initialValue: unknown;
  subject: ReturnType<typeof useSubject>;
  setValue: ReturnType<typeof useSetStageValue>;
};

/** Captures the hooks' output for the path under test. */
const makeProbe = (path: string) => {
  const readings: Probe[] = [];

  const ProbeComponent = () => {
    readings.push({
      value: useStageFormValue(path),
      initialValue: useStageInitialValue(path),
      subject: useSubject(),
      setValue: useSetStageValue(),
    });
    return null;
  };

  const latest = () => {
    const reading = readings.at(-1);
    if (!reading) throw new Error('probe never rendered');
    return reading;
  };

  return { ProbeComponent, readings, latest };
};

describe('stageFormHooks', () => {
  it('rejects null writes at the stage-field boundary', () => {
    expectTypeOf<null>().not.toMatchTypeOf<
      Parameters<ReturnType<typeof useSetStageValue>>[1]
    >();
  });

  describe('useStageFormValue', () => {
    it('falls back to the committed stage while no field is registered', () => {
      const { ProbeComponent, latest } = makeProbe('interviewScript');

      renderStageForm({
        committedStage: asStage({ interviewScript: 'Read this aloud' }),
        children: <ProbeComponent />,
      });

      expect(latest().value).toBe('Read this aloud');
    });

    it('prefers a registered field, and tracks its edits', () => {
      const { ProbeComponent, latest } = makeProbe('label');

      renderStageForm({
        committedStage: asStage({ label: 'Committed' }),
        children: (
          <>
            <ProbeComponent />
            <Field
              name="label"
              label="Label"
              component={InputField}
              initialValue="Committed"
            />
          </>
        ),
      });

      expect(latest().value).toBe('Committed');

      act(() => {
        latest().setValue('label', 'Edited');
      });

      expect(latest().value).toBe('Edited');
    });

    it('sees a write to a name no field currently owns', () => {
      const { ProbeComponent, latest } = makeProbe('skipLogic');

      renderStageForm({ children: <ProbeComponent /> });

      expect(latest().value).toBeUndefined();

      // The dormant pending-value slot: how undo/redo restores a value into a
      // collapsed section so it can reopen on it.
      act(() => {
        latest().setValue('skipLogic', { action: 'SKIP' });
      });

      expect(latest().value).toEqual({ action: 'SKIP' });
    });

    it('reads a container path assembled from its registered leaves', () => {
      const { ProbeComponent, latest } = makeProbe('introductionPanel');

      renderStageForm({
        children: (
          <>
            <ProbeComponent />
            <Field
              name="introductionPanel.title"
              label="Title"
              component={InputField}
              initialValue="Welcome"
            />
          </>
        ),
      });

      expect(latest().value).toEqual({ title: 'Welcome' });
    });
  });

  describe('useStageInitialValue', () => {
    it('keeps its identity across renders, so it is safe as a register dep', () => {
      const { ProbeComponent, readings, latest } = makeProbe('form');

      const view = renderStageForm({
        committedStage: asStage({ form: { fields: [] } }),
        children: <ProbeComponent />,
      });

      view.renderTree(<ProbeComponent />);

      expect(readings.length).toBeGreaterThan(1);
      expect(latest().initialValue).toBe(readings[0]!.initialValue);
    });

    it('is unaffected by later edits to the same path', () => {
      const { ProbeComponent, latest } = makeProbe('label');

      renderStageForm({
        committedStage: asStage({ label: 'Committed' }),
        children: <ProbeComponent />,
      });

      act(() => {
        latest().setValue('label', 'Edited');
      });

      expect(latest().initialValue).toBe('Committed');
    });
  });

  describe('useSubject', () => {
    it('defaults to ego when the stage has no subject', () => {
      const { ProbeComponent, latest } = makeProbe('subject');

      renderStageForm({ children: <ProbeComponent /> });

      expect(latest().subject).toEqual({
        subject: { entity: 'ego' },
        entity: 'ego',
        type: null,
      });
    });

    it('derives entity and type from the stage subject', () => {
      const { ProbeComponent, latest } = makeProbe('subject');

      renderStageForm({
        committedStage: asStage({
          subject: { entity: 'node', type: 'person' },
        }),
        children: <ProbeComponent />,
      });

      expect(latest().subject).toEqual({
        subject: { entity: 'node', type: 'person' },
        entity: 'node',
        type: 'person',
      });
    });
  });
});
