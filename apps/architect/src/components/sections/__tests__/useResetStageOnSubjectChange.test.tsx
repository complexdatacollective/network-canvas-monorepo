import { act } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type { StageType } from '@codaco/protocol-validation';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

import useResetStageOnSubjectChange from '../useResetStageOnSubjectChange';

const ValueProbe = (() => null) as ComponentType<Record<string, unknown>>;

/** Stable identities: `initialValue` is a register-effect dependency. */
const PERSON = { entity: 'node', type: 'person' } as const;
const FRIEND = { entity: 'node', type: 'friend' } as const;
const FORM_FIELDS = [{ variable: 'person-name', prompt: 'Name' }];

const SubjectField = () => (
  <Field
    name="subject"
    label="Node type"
    component={ValueProbe}
    initialValue={PERSON}
  />
);

const ResetOnSubjectChange = ({
  interfaceType,
}: {
  interfaceType: StageType;
}) => {
  useResetStageOnSubjectChange(interfaceType);
  return null;
};

describe('useResetStageOnSubjectChange', () => {
  it('resets the descendants a section registers, not just their container', () => {
    const { getFieldState, getFormValues, getStoreApi } = renderStageForm({
      committedStage: asStage({
        id: 'stage-1',
        type: 'AlterForm',
        label: 'Ask about each person',
        subject: PERSON,
        form: { title: 'About this person', fields: FORM_FIELDS },
      }),
      children: (
        <>
          <ResetOnSubjectChange interfaceType="AlterForm" />
          <SubjectField />
          {/* The Form section registers these exact leaf names; `form` itself
              is never a field. */}
          <Field
            name="form.title"
            label="Form title"
            component={ValueProbe}
            initialValue="About this person"
          />
          <Field
            name="form.fields"
            label="Form fields"
            component={ValueProbe}
            initialValue={FORM_FIELDS}
          />
        </>
      ),
    });

    act(() => {
      getStoreApi().getState().setFieldValue('subject', FRIEND);
    });

    expect(getFieldState('form.fields')?.value).toBeUndefined();
    expect(getFieldState('form.title')?.value).toBeUndefined();
    // The saved stage is assembled from registered fields, so a surviving
    // descendant would be committed with the new subject.
    const { form } = getFormValues() as { form?: { fields?: unknown } };
    expect(form?.fields).toBeUndefined();
  });

  it('re-seeds a nested interface-template default onto the field that owns it', () => {
    const { getFieldState, getStoreApi } = renderStageForm({
      committedStage: asStage({
        id: 'stage-1',
        type: 'Narrative',
        subject: PERSON,
        behaviours: { automaticLayout: false, freeDraw: true },
      }),
      children: (
        <>
          <ResetOnSubjectChange interfaceType="Narrative" />
          <SubjectField />
          <Field
            name="behaviours.automaticLayout"
            label="Automatic layout"
            component={ValueProbe}
            initialValue={false}
          />
          <Field
            name="behaviours.freeDraw"
            label="Free draw"
            component={ValueProbe}
            initialValue={true}
          />
        </>
      ),
    });

    act(() => {
      getStoreApi().getState().setFieldValue('subject', FRIEND);
    });

    // The Narrative template turns `automaticLayout` (and
    // `allowRepositioning`) on; `freeDraw` is not in the template at all.
    expect(getFieldState('behaviours.automaticLayout')?.value).toBe(true);
    expect(getFieldState('behaviours.freeDraw')?.value).toBeUndefined();
  });

  it('keeps the configuration an undo restored alongside the subject', () => {
    const { getFieldState, getContext, getStoreApi } = renderStageForm({
      committedStage: asStage({
        id: 'stage-1',
        type: 'AlterForm',
        subject: PERSON,
        form: { title: 'About this person', fields: FORM_FIELDS },
      }),
      children: (
        <>
          <ResetOnSubjectChange interfaceType="AlterForm" />
          <SubjectField />
          <Field
            name="form.fields"
            label="Form fields"
            component={ValueProbe}
            initialValue={FORM_FIELDS}
          />
        </>
      ),
    });

    act(() => {
      getStoreApi().getState().setFieldValue('subject', FRIEND);
    });
    expect(getFieldState('form.fields')?.value).toBeUndefined();

    // Stands in for `useStageDraftHistory`, which writes every field named in
    // the timeline snapshot inside a single `runRestore`.
    act(() => {
      getContext().draft.runRestore(() => {
        const { setFieldValue } = getStoreApi().getState();
        setFieldValue('subject', PERSON);
        setFieldValue('form.fields', FORM_FIELDS);
      });
    });

    expect(getFieldState('form.fields')?.value).toEqual(FORM_FIELDS);
  });

  it('leaves everything alone when the stage is simply loaded', () => {
    const { getFieldState } = renderStageForm({
      committedStage: asStage({
        id: 'stage-1',
        type: 'AlterForm',
        subject: PERSON,
        form: { title: 'About this person', fields: FORM_FIELDS },
      }),
      children: (
        <>
          <ResetOnSubjectChange interfaceType="AlterForm" />
          <SubjectField />
          <Field
            name="form.fields"
            label="Form fields"
            component={ValueProbe}
            initialValue={FORM_FIELDS}
          />
        </>
      ),
    });

    expect(getFieldState('form.fields')?.value).toEqual(FORM_FIELDS);
  });
});
