import { act, screen, waitFor } from '@testing-library/react';
import { type ComponentType, useEffect, useRef } from 'react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ArrayField from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import type { ArrayFieldItemProps } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import type { StageType } from '@codaco/protocol-validation';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';
import { useStageRestoreVersion } from '~/components/StageEditor/StageFormBridge';
import { useStageFormValue } from '~/components/StageEditor/stageFormHooks';

import useResetStageOnSubjectChange from '../useResetStageOnSubjectChange';

const ValueProbe = (() => null) as ComponentType<Record<string, unknown>>;

/**
 * The shape every section that resets dependent configuration uses: watch a
 * value, and when it changes, tell an undo/redo restore from a user edit by
 * whether the restore version moved alongside it.
 */
const GuardedObserver = ({ log }: { log: string[] }) => {
  const value = useStageFormValue('form.fields');
  const previousValue = useRef(value);
  const restoreVersion = useStageRestoreVersion();
  const previousRestoreVersion = useRef(restoreVersion);

  useEffect(() => {
    const beforeValue = previousValue.current;
    previousValue.current = value;
    const beforeVersion = previousRestoreVersion.current;
    previousRestoreVersion.current = restoreVersion;
    if (beforeValue === value) return;
    log.push(beforeVersion === restoreVersion ? 'edit' : 'restore');
  }, [log, restoreVersion, value]);

  return null;
};

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

type BinPrompt = { id: string; text: string };

const BinPromptItem = ({ item }: ArrayFieldItemProps<BinPrompt>) => (
  <span>{item.text}</span>
);

const BinPromptField = ({ prompts }: { prompts: BinPrompt[] }) => (
  <Field
    name="prompts"
    label="Prompts"
    component={ArrayField<BinPrompt>}
    initialValue={prompts}
    itemComponent={BinPromptItem}
    itemTemplate={() => ({ id: 'draft', text: '' })}
    confirmDelete={false}
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
  it.each(['OrdinalBin', 'CategoricalBin'] as const)(
    'clears a rendered %s prompt array without passing null to ArrayField',
    async (interfaceType) => {
      const prompts = [{ id: 'p1', text: 'Old subject prompt' }];
      const { getFieldState, getStoreApi } = renderStageForm({
        committedStage: asStage({
          id: 'stage-1',
          type: interfaceType,
          label: 'Sort people',
          subject: PERSON,
          prompts,
        }),
        children: (
          <DialogProvider>
            <ResetOnSubjectChange interfaceType={interfaceType} />
            <SubjectField />
            <BinPromptField prompts={prompts} />
          </DialogProvider>
        ),
      });

      expect(screen.getByText('Old subject prompt')).toBeInTheDocument();

      act(() => {
        getStoreApi().getState().setFieldValue('subject', FRIEND);
      });

      expect(getFieldState('prompts')?.value).toBeUndefined();
      await waitFor(() => {
        expect(
          screen.queryByText('Old subject prompt'),
        ).not.toBeInTheDocument();
      });
      expect(screen.getByText(/no items added yet/i)).toBeInTheDocument();
    },
  );

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

  // The reset writes one field at a time, and an array-valued field snapshots
  // on the write, so an unbatched loop put half-reset states — the NEW subject
  // still carrying the OLD subject's prompts and form fields — on the undo
  // timeline, where they are reachable and saveable.
  describe('timeline', () => {
    const PROMPTS = [{ id: 'p1', text: 'Old subject prompt' }];

    const renderAlterForm = () =>
      renderStageForm({
        committedStage: asStage({
          id: 'stage-1',
          type: 'AlterForm',
          label: 'Ask about each person',
          subject: PERSON,
          form: { title: 'About this person', fields: FORM_FIELDS },
          prompts: PROMPTS,
        }),
        children: (
          <>
            <ResetOnSubjectChange interfaceType="AlterForm" />
            <SubjectField />
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
            <Field
              name="prompts"
              label="Prompts"
              component={ValueProbe}
              initialValue={PROMPTS}
            />
          </>
        ),
      });

    /** Past the leaf debounce, so a trailing entry would have landed. */
    const settle = async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 450));
      });
    };

    it('records the subject change and the whole reset as one entry', async () => {
      const { snapshots, getStoreApi, getPresent } = renderAlterForm();

      act(() => {
        getStoreApi().getState().setFieldValue('subject', FRIEND);
      });
      await settle();

      expect(snapshots).toHaveLength(1);
      // No stop where the new subject still holds the old subject's arrays.
      expect(getPresent()).toEqual({
        subject: FRIEND,
        form: {},
        // The template has no prompts for an AlterForm, so the reset uses the
        // form contract's unset value rather than leaving the old subject's.
        prompts: undefined,
      });
    });

    it('takes the subject change back in one undo, and redoes it whole', async () => {
      const { snapshots, getFieldState, getHistory, getStoreApi, store } =
        renderAlterForm();

      act(() => {
        getStoreApi().getState().setFieldValue('subject', FRIEND);
      });
      await settle();

      act(() => {
        getHistory().undo();
      });

      expect(getFieldState('subject')?.value).toEqual(PERSON);
      expect(getFieldState('form.fields')?.value).toEqual(FORM_FIELDS);
      expect(getFieldState('form.title')?.value).toBe('About this person');
      expect(getFieldState('prompts')?.value).toEqual(PROMPTS);
      expect(store.getState().stageEditorDraft.history.past).toHaveLength(0);

      act(() => {
        getHistory().redo();
      });

      expect(getFieldState('subject')?.value).toEqual(FRIEND);
      expect(getFieldState('form.fields')?.value).toBeUndefined();
      expect(getFieldState('prompts')?.value).toBeUndefined();
      expect(snapshots).toHaveLength(1);
      expect(store.getState().stageEditorDraft.history.future).toHaveLength(0);
      expect(getHistory().canUndo).toBe(true);
    });

    it('does not read as a restore to a guarded observer', async () => {
      const classifications: string[] = [];

      const { getStoreApi } = renderStageForm({
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
            <GuardedObserver log={classifications} />
          </>
        ),
      });

      act(() => {
        getStoreApi().getState().setFieldValue('subject', FRIEND);
      });
      await settle();

      // The reset's own writes must reach a sibling observer as ordinary
      // edits: a bumped restore version would make every guarded section skip
      // the reaction the user's change deserves.
      expect(classifications).toEqual(['edit']);
    });
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
