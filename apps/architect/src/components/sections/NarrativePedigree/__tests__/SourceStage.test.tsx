import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import {
  type StageFormContextValue,
  useStageFormContext,
} from '~/components/StageEditor/stageFormContext';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

import SourceStage from '../SourceStage';

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
  it('renders the Source Stage section title', () => {
    renderSection();
    expect(screen.getByText('Source Stage')).toBeDefined();
  });

  it('renders the sourceStageId field with its label', () => {
    renderSection();
    expect(
      screen.getByRole('combobox', { name: 'Family Pedigree stage' }),
    ).toBeInTheDocument();
  });

  it('lists only FamilyPedigree stages as options', () => {
    renderSection();

    fireEvent.click(
      screen.getByRole('combobox', { name: 'Family Pedigree stage' }),
    );

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
      screen.getByRole('combobox', { name: 'Family Pedigree stage' }),
    ).toBeDisabled();
  });

  it('leaves the field enabled when a FamilyPedigree stage exists', () => {
    renderSection();
    expect(
      screen.getByRole('combobox', { name: 'Family Pedigree stage' }),
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
});
