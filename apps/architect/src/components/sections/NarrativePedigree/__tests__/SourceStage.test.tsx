import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import {
  type StageFormContextValue,
  useStageFormContext,
} from '~/components/StageEditor/stageFormContext';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

import SourceStage from '../SourceStage';

/** Stable identity: `component` remounting the field would churn the store. */
const ValueProbe = (() => null) as ComponentType<Record<string, unknown>>;

const FAMILY_PEDIGREE_STAGES = [
  { id: 'stage-1', type: 'FamilyPedigree', label: 'My Family Tree' },
  { id: 'stage-2', type: 'NameGenerator', label: 'Name Generator' },
  { id: 'stage-3', type: 'FamilyPedigree', label: 'Second Pedigree' },
];

const renderSection = ({
  stages = FAMILY_PEDIGREE_STAGES,
  committedStage = {},
}: {
  stages?: unknown[];
  committedStage?: Record<string, unknown>;
} = {}) => {
  const store = configureStore({
    reducer: {
      activeProtocol: (
        state = { present: { schemaVersion: 8, codebook: {}, stages } },
      ) => state,
      stageEditorDraft,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

  let context: StageFormContextValue | null = null;
  const Probe = () => {
    context = useStageFormContext();
    return null;
  };

  const view = render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={
            {
              id: 'narrative-1',
              type: 'NarrativePedigree',
              ...committedStage,
            } as unknown as Stage
          }
          stageId="narrative-1"
          formId="edit-stage"
        >
          <Probe />
          <SourceStage
            stagePath={null}
            stagePosition={0}
            interfaceType="NarrativePedigree"
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  const getContext = (): StageFormContextValue => {
    if (!context) throw new Error('stage form context was not captured');
    return context;
  };

  return {
    ...view,
    // `diseases` is owned by the sibling Diseases section, not mounted here,
    // so it is never a *registered* field in this tree — `getFormValues()`
    // (registered fields only) can't see it. `getFieldState` reads the
    // dormant slot `setStageValue` writes to instead, matching how
    // `useStageFormValue` resolves it for a real, fully-mounted stage form.
    getDiseasesValue: () =>
      getContext().storeApi.getState().getFieldState('diseases')?.value,
    setSourceStageId: (value: string) => {
      act(() => {
        getContext().storeApi.getState().setFieldValue('sourceStageId', value);
      });
    },
    /**
     * Stands in for `useStageDraftHistory`, whose `applyDiff` writes every
     * field named in the timeline snapshot inside a single `runRestore`.
     */
    restore: (values: Record<string, unknown>) => {
      act(() => {
        getContext().draft.runRestore(() => {
          const { setFieldValue } = getContext().storeApi.getState();
          for (const [name, value] of Object.entries(values)) {
            setFieldValue(name, value as never);
          }
        });
      });
    },
  };
};

describe('SourceStage', () => {
  it('renders the field label and guidance visibly', () => {
    renderSection();
    const label = screen.getByText('Source stage');
    expect(label).toBeVisible();
    // Visibility is the behaviour under test; jsdom does not load Tailwind's
    // screen-reader-only declaration, so assert the design-system visibility
    // token directly as well as the accessible name.
    expect(label).not.toHaveClass('sr-only');
    expect(
      screen.getByText(
        'Select the Family Pedigree stage whose network data this Narrative Pedigree will visualize. Only Family Pedigree stages are listed here.',
      ),
    ).toBeVisible();
  });

  it('renders the sourceStageId field with its label', () => {
    renderSection();
    expect(
      screen.getByRole('combobox', { name: 'Source stage' }),
    ).toBeInTheDocument();
  });

  it('lists only FamilyPedigree stages as options', () => {
    renderSection();

    fireEvent.click(screen.getByRole('combobox', { name: 'Source stage' }));

    expect(
      screen.getByRole('option', { name: 'My Family Tree' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Second Pedigree' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Name Generator' })).toBeNull();
  });

  it('disables the field when no FamilyPedigree stage exists', () => {
    renderSection({ stages: [] });
    expect(
      screen.getByRole('combobox', { name: 'Source stage' }),
    ).toBeDisabled();
  });

  it('leaves the field enabled when a FamilyPedigree stage exists', () => {
    renderSection();
    expect(
      screen.getByRole('combobox', { name: 'Source stage' }),
    ).toBeEnabled();
  });

  it('does not clear diseases on the initial (mount-time) pick', () => {
    const view = renderSection({
      committedStage: { sourceStageId: 'stage-1', diseases: [{ id: 'd1' }] },
    });

    // No write reaches `diseases` at all — its dormant slot stays empty, so
    // the committed value survives when Diseases.tsx itself mounts.
    expect(view.getDiseasesValue()).toBeUndefined();
  });

  it('clears diseases when the source stage is changed to a different one', () => {
    const view = renderSection({
      committedStage: { sourceStageId: 'stage-1', diseases: [{ id: 'd1' }] },
    });

    view.setSourceStageId('stage-3');

    expect(view.getDiseasesValue()).toEqual([]);
  });

  it('does not clear diseases when the same source stage is reselected', () => {
    const view = renderSection({
      committedStage: { sourceStageId: 'stage-1', diseases: [{ id: 'd1' }] },
    });

    view.setSourceStageId('stage-1');

    expect(view.getDiseasesValue()).toBeUndefined();
  });

  describe('undo', () => {
    const DISEASES = [{ id: 'd1' }];

    it('keeps the diseases an undo restored alongside the source stage', () => {
      const view = renderSection({
        committedStage: { sourceStageId: 'stage-1', diseases: DISEASES },
      });

      view.setSourceStageId('stage-3');
      expect(view.getDiseasesValue()).toEqual([]);

      view.restore({ sourceStageId: 'stage-1', diseases: DISEASES });

      // The restore brought stage-1's diseases back with the source stage;
      // observing the restored source as "a change" must not clear them again.
      expect(view.getDiseasesValue()).toEqual(DISEASES);
    });

    it('still clears diseases on a user edit that follows a restore', () => {
      const view = renderSection({
        committedStage: { sourceStageId: 'stage-1', diseases: DISEASES },
      });

      view.setSourceStageId('stage-3');
      view.restore({ sourceStageId: 'stage-1', diseases: DISEASES });
      view.setSourceStageId('stage-3');

      expect(view.getDiseasesValue()).toEqual([]);
    });

    it('still clears diseases on a user edit after a restore that left the source stage alone', () => {
      const view = renderSection({
        committedStage: { sourceStageId: 'stage-1', diseases: DISEASES },
      });

      // A restore of some other field bumps the same counter, so the guard has
      // to be consumed even when `sourceStageId` did not move.
      view.restore({ diseases: DISEASES });
      view.setSourceStageId('stage-3');

      expect(view.getDiseasesValue()).toEqual([]);
    });
  });

  // The clear is two writes (`undefined` for every registered/dormant
  // descendant, then the empty array the Diseases validator expects), and the
  // sibling Diseases section keeps `diseases` REGISTERED, so both writes are
  // structural array changes that snapshot on the spot. Unbatched, the source
  // stage change therefore pushed two entries whose only difference —
  // `undefined` vs `[]` — renders identically, so the first undo press looked
  // like it did nothing.
  describe('timeline', () => {
    const DISEASES = [{ id: 'd1', variable: 'v1' }];

    const renderWithDiseases = () =>
      renderStageForm({
        committedStage: asStage({
          id: 'narrative-1',
          type: 'NarrativePedigree',
          sourceStageId: 'stage-1',
          diseases: DISEASES,
        }),
        extraReducers: {
          activeProtocol: (
            state = {
              present: {
                schemaVersion: 8,
                codebook: {},
                stages: FAMILY_PEDIGREE_STAGES,
              },
            },
          ) => state,
        },
        children: (
          <>
            <SourceStage
              stagePath={null}
              stagePosition={0}
              interfaceType="NarrativePedigree"
            />
            {/* The Diseases section is always mounted in the real editor, so
                `diseases` is always a registered field. */}
            <Field
              name="diseases"
              label="Diseases"
              component={ValueProbe}
              initialValue={DISEASES}
            />
          </>
        ),
      });

    const setSourceStageId = (
      view: ReturnType<typeof renderWithDiseases>,
      value: string,
    ) => {
      act(() => {
        view.getStoreApi().getState().setFieldValue('sourceStageId', value);
      });
    };

    /** Past the leaf debounce, so a trailing entry would have landed. */
    const settle = async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 450));
      });
    };

    it('records the source-stage change and the diseases clear as one entry', async () => {
      const view = renderWithDiseases();

      setSourceStageId(view, 'stage-3');
      await settle();

      expect(view.snapshots).toHaveLength(1);
      expect(view.getPresent()).toEqual({
        sourceStageId: 'stage-3',
        diseases: [],
      });
    });

    it('takes the source-stage change back in one undo, and redoes it whole', async () => {
      const view = renderWithDiseases();

      setSourceStageId(view, 'stage-3');
      await settle();

      act(() => {
        view.getHistory().undo();
      });

      // The intermediate `diseases: undefined` stop must not exist: one press
      // is the whole gesture.
      expect(view.getFieldState('sourceStageId')?.value).toBe('stage-1');
      expect(view.getFieldState('diseases')?.value).toEqual(DISEASES);
      expect(view.store.getState().stageEditorDraft.history.past).toHaveLength(
        0,
      );

      act(() => {
        view.getHistory().redo();
      });

      expect(view.getFieldState('sourceStageId')?.value).toBe('stage-3');
      expect(view.getFieldState('diseases')?.value).toEqual([]);
      expect(view.snapshots).toHaveLength(1);
      expect(
        view.store.getState().stageEditorDraft.history.future,
      ).toHaveLength(0);
      expect(view.getHistory().canUndo).toBe(true);
    });
  });
});
