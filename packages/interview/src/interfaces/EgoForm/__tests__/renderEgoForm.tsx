import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type {
  LocaleTag,
  LocalizationDeclaration,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { AnalyticsContext } from '../../../analytics/AnalyticsContext';
import { NULL_TRACKER, type Tracker } from '../../../analytics/tracker';
import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataProvider } from '../../../contexts/StageMetadataContext';
import { StageDynamicValues } from '../../../dynamicValues/DynamicValueScope';
import useInterviewNavigation from '../../../hooks/useInterviewNavigation';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import EgoForm from '../EgoForm';

type EgoFormStage = StageProps<'EgoForm'>['stage'];

const ENGLISH_ONLY: LocalizationDeclaration = {
  defaultLocale: 'en',
  locales: ['en'],
};

/** The stage after the form, so that moving forward has somewhere to go. */
const NEXT_SCREEN = {
  id: 'next-screen',
  type: 'Information',
  label: { en: 'Next screen' },
  content: { en: '# Next screen' },
};

/**
 * Renders `stage`, an Ego Form, as the Shell renders it: the first stage of a
 * protocol in `localization` whose ego has `egoVariables`, for an ego whose
 * attributes are `stored`, with the interview's own navigation and dynamic
 * values, in `locale` (else in the protocol's default language). Events go
 * to `tracker`.
 */
export const renderEgoForm = ({
  stage,
  egoVariables,
  stored = {},
  localization = ENGLISH_ONLY,
  locale = null,
  tracker = NULL_TRACKER,
}: Readonly<{
  stage: EgoFormStage;
  egoVariables: Readonly<Record<string, unknown>>;
  stored?: Readonly<Record<string, unknown>>;
  localization?: LocalizationDeclaration;
  locale?: LocaleTag | null;
  tracker?: Tracker;
}>) => {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 'session',
        network: {
          ego: { [entityAttributesProperty]: stored },
          nodes: [],
          edges: [],
        },
      } as never,
      protocol: {
        id: 'protocol',
        hash: 'hash',
        schemaVersion: 9,
        localization,
        codebook: { node: {}, edge: {}, ego: { variables: egoVariables } },
        stages: [stage, NEXT_SCREEN],
      } as never,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  let moveForwardOnStage: (() => Promise<void>) | undefined;

  function Harness() {
    const navigation = useInterviewNavigation(0);
    moveForwardOnStage = navigation.moveForward;
    return (
      <StageMetadataProvider value={navigation.registerBeforeNext}>
        <StageDynamicValues stage={stage}>
          <EgoForm
            stage={stage}
            getNavigationHelpers={() => ({
              moveForward: navigation.moveForward,
              moveBackward: vi.fn(),
            })}
          />
        </StageDynamicValues>
      </StageMetadataProvider>
    );
  }

  const interviewIn = (shownLocale: LocaleTag | null) => (
    <TestProtocolLocalization localization={localization} locale={shownLocale}>
      <Provider store={store}>
        <AnalyticsContext.Provider value={tracker}>
          <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
            <DialogProvider>
              <Harness />
            </DialogProvider>
          </CurrentStepProvider>
        </AnalyticsContext.Provider>
      </Provider>
    </TestProtocolLocalization>
  );
  const { container, rerender } = render(interviewIn(locale));

  /** The ego's attributes as the interview has stored them. */
  const egoAttributes = () =>
    store.getState().session.network?.ego?.[entityAttributesProperty];
  /** Submits the form, as pressing Enter in it does. */
  const submit = () => {
    const form = container.querySelector('form');
    if (form === null) throw new Error('The form was not rendered');
    fireEvent.submit(form);
  };
  /** Asks the interview to move to the next stage, as the Next button does. */
  const moveForward = () => {
    if (moveForwardOnStage === undefined) {
      throw new Error('The form was not rendered');
    }
    return moveForwardOnStage();
  };
  /** Shows the interview in `shownLocale`, as the participant's choice of language does. */
  const showLanguage = (shownLocale: LocaleTag) =>
    rerender(interviewIn(shownLocale));
  return { egoAttributes, submit, moveForward, showLanguage };
};
