import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { type ReactNode, useMemo } from 'react';
import { Provider } from 'react-redux';
import { expect, vi } from 'vitest';
import { Router, useLocation } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { ToolbarGroup } from '@codaco/fresco-ui/SegmentedToolbar';
import type {
  Finding,
  ReviewResult,
} from '@codaco/protocol-review-worker/contract';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import {
  ActionToolbarProvider,
  useActionToolbar,
} from '~/components/ProjectNav/ActionToolbar';
import type { ProjectActionsMode } from '~/components/ProjectNav/ProjectActions';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { setActiveProtocolId, setProtocolLockState } from '~/ducks/modules/app';
import { rootReducer } from '~/ducks/modules/root';
import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';
import {
  makeFinding,
  makeProtocol,
  op,
} from '~/protocolReview/__tests__/fixtures';
import type { ReviewOutcome } from '~/protocolReview/reviewClient';
import { protocolReviewListenerMiddleware } from '~/protocolReview/reviewListener';

import { useReviewProtocolToolbarAction } from '../ReviewProtocolAction';

export const makeStore = () =>
  configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).prepend(
        protocolReviewListenerMiddleware.middleware,
      ),
  });

export type TestStore = ReturnType<typeof makeStore>;

/**
 * Four problems, in the service's order (most serious first): a wording fix
 * to a prompt that also exists in French, a title fix, a fix that leaves the
 * protocol invalid, and advice with no fix at all.
 */
const FINDINGS: Finding[] = [
  makeFinding(
    'prompt',
    [op('set', '/stages/names/prompts/p1/text', 'Name everyone you know')],
    {
      stageId: 'names',
      severity: 'serious',
      category: 'wording',
      title: 'The prompt is vague',
    },
  ),
  makeFinding(
    'title',
    [op('set', '/stages/welcome/title/en', 'Welcome to our study')],
    {
      stageId: 'welcome',
      severity: 'worth_fixing',
      category: 'burden',
      title: 'The welcome title is unclear',
    },
  ),
  makeFinding('broken', [op('set', '/stages/welcome/type', 'NotAStage')], {
    codebookEntity: 'node',
    codebookTypeId: 'person',
    category: 'structure',
    severity: 'worth_fixing',
    title: 'The person type is misused',
  }),
  makeFinding('advice', [], {
    category: 'research_fit',
    severity: 'suggestion',
    title: 'Nothing answers the research question',
  }),
];

export const RESULT: ReviewResult = {
  reviewId: '0b8f4c1e-9d0a-4a3e-8f8f-1f2e3d4c5b6a',
  findings: FINDINGS,
  quota: { limit: 5, remaining: 4, resetsAt: '2099-01-01T00:00:00.000Z' },
};

/** An answer the test releases when it chooses. */
export const gatedOutcome = () => {
  let release: (outcome: ReviewOutcome) => void = () => undefined;
  const promise = new Promise<ReviewOutcome>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

let protocolCounter = 0;

/** Opens `protocol` under a fresh library id, owned by this tab. */
export const openProtocol = async (
  store: TestStore,
  protocol: CurrentProtocol = makeProtocol(),
) => {
  protocolCounter += 1;
  const id = `review-ui-${protocolCounter}`;
  store.dispatch(setProtocolLockState('owned'));
  store.dispatch(setActiveProtocolId(id));
  store.dispatch(setActiveProtocol(protocol));
  await vi.waitFor(() => {
    expect(store.getState().protocolReview.record?.protocolId).toBe(id);
  });
  return id;
};

const LocationProbe = () => {
  const [location] = useLocation();
  return <output data-testid="location">{location}</output>;
};

const Toolbar = ({
  location,
  mode,
}: {
  location: string;
  mode: ProjectActionsMode;
}) => {
  const action = useReviewProtocolToolbarAction(location, mode);
  const props = useMemo(
    () => ({
      children: action ? (
        <ToolbarGroup key="review" aria-label="Review">
          {action}
        </ToolbarGroup>
      ) : (
        []
      ),
    }),
    [action],
  );
  useActionToolbar(props);
  return null;
};

/**
 * The toolbar as the Stages screen publishes it, with the app's dialog
 * provider, a router at `path` and a readout of where the router is.
 */
export const renderToolbar = (
  store: TestStore,
  {
    path = '/protocol',
    mode = 'authoring',
    children,
  }: { path?: string; mode?: ProjectActionsMode; children?: ReactNode } = {},
) =>
  render(
    <Provider store={store}>
      <ArchitectI18nProvider>
        <Router hook={memoryLocation({ path }).hook}>
          <DialogProvider>
            <ActionToolbarProvider>
              <Toolbar location={path} mode={mode} />
              <LocationProbe />
              {children}
            </ActionToolbarProvider>
          </DialogProvider>
        </Router>
      </ArchitectI18nProvider>
    </Provider>,
  );

/** The Review protocol toolbar button, whatever it currently says. */
export const reviewButton = () =>
  screen.getByRole('button', { name: /Review protocol|Reviewing/ });
