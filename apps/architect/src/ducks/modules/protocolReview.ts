import {
  createSelector,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';

import {
  type Finding,
  type FindingCategory,
  type FindingSeverity,
  REVIEW_LIMITS,
  type ReviewErrorCode,
  type ReviewQuota,
} from '@codaco/protocol-review-worker/contract';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { AppDispatch } from '~/ducks/store';
import { getArchitectIntl } from '~/i18n/imperative';
import {
  effectiveQuota,
  getReviewInstallationId,
  readStoredQuota,
  writeStoredQuota,
} from '~/protocolReview/browserState';
import {
  describeFixTextEdits,
  type FindingLocation,
  type FixTextEdit,
  resolveFindingLocation,
} from '~/protocolReview/describeFix';
import { reviewFingerprint } from '~/protocolReview/fingerprint';
import {
  applyOperations,
  fixFits,
  writtenHolds,
} from '~/protocolReview/fixEngine';
import {
  editProtocol,
  protocolReplacement,
  recordFix,
} from '~/protocolReview/protocolFix';
import {
  captureReviewCompleted,
  captureReviewDecision,
  captureReviewFailed,
  captureReviewStarted,
  completedPayload,
  decisionPayload,
} from '~/protocolReview/reviewAnalytics';
import { requestReview } from '~/protocolReview/reviewClient';
import {
  type FindingDecision,
  readReviewRecord,
  type StoredFinding,
  type StoredReviewRecord,
  writeReviewRecord,
} from '~/protocolReview/reviewStore';
import {
  getIsProtocolReviewEnabled,
  getProtocol,
  getProtocolReviewStudyContext,
} from '~/selectors/protocol';

import { actionCreators as activeProtocolActions } from './activeProtocol';
import { getActiveProtocolId, getProtocolOwnedHere } from './app';
import type { RootState } from './root';

/**
 * The automated protocol review, for the protocol being edited.
 *
 * Neither persisted by redux-remember (only `app` is) nor part of the undo
 * history (`protocolReview/` actions do not match the timeline's pattern):
 * the review lives in its own IndexedDB record (`reviewStore`), and this
 * slice holds the active protocol's copy, the run in progress and the quota.
 *
 * Everything a finding shows — whether its fix still fits, whether it holds,
 * whether it can be undone — is derived from the protocol as it stands by the
 * selectors at the end, never stored as a flag.
 */

// ---------------------------------------------------------------------------
// State

export type ReviewRun =
  | { status: 'idle' }
  | {
      status: 'running';
      /**
       * Which run this is. Every later word about a run names it, and the
       * slice ignores one that is not about the run it holds: a review that
       * is still finishing for a protocol since closed cannot touch the run
       * of the protocol now open.
       */
      runId: number;
      /** Epoch milliseconds. */
      startedAt: number;
      /** Characters of the model's answer received so far. */
      received: number;
    }
  | { status: 'failed'; code: ReviewErrorCode; retryAt: string | null };

/**
 * Whether applying a finding's edits (`fix`) or its inverse (`undo`) to
 * `protocol` leaves a valid protocol. Kept per finding against the exact
 * protocol object checked: a check for any other protocol is not an answer.
 */
type FixCheck = {
  protocol: CurrentProtocol;
  kind: 'fix' | 'undo';
  valid: boolean;
};

type ProtocolReviewState = {
  /** The record of the active protocol, once read. */
  record: StoredReviewRecord | null;
  run: ReviewRun;
  /** As last reported by the service (see `getProtocolReviewQuota`). */
  quota: ReviewQuota | null;
  checks: Record<string, FixCheck>;
};

const initialState: ProtocolReviewState = {
  record: null,
  run: { status: 'idle' },
  quota: null,
  checks: {},
};

const isRun = (
  run: ReviewRun,
  runId: number,
): run is Extract<ReviewRun, { status: 'running' }> =>
  run.status === 'running' && run.runId === runId;

const protocolReviewSlice = createSlice({
  name: 'protocolReview',
  initialState,
  reducers: {
    recordReplaced: (state, action: PayloadAction<StoredReviewRecord>) => {
      if (state.record?.review?.reviewId !== action.payload.review?.reviewId) {
        state.checks = {};
      }
      state.record = action.payload;
    },
    reviewCleared: (state) => ({ ...initialState, quota: state.quota }),
    runStarted: (
      state,
      action: PayloadAction<{ runId: number; startedAt: number }>,
    ) => {
      state.run = {
        status: 'running',
        runId: action.payload.runId,
        startedAt: action.payload.startedAt,
        received: 0,
      };
    },
    // The three below are about one run, and do nothing unless it is the run
    // the slice holds.
    runProgress: (
      state,
      action: PayloadAction<{ runId: number; received: number }>,
    ) => {
      if (!isRun(state.run, action.payload.runId)) return;
      state.run.received = Math.max(
        state.run.received,
        action.payload.received,
      );
    },
    runFinished: (state, action: PayloadAction<{ runId: number }>) => {
      if (!isRun(state.run, action.payload.runId)) return;
      state.run = { status: 'idle' };
    },
    runFailed: (
      state,
      action: PayloadAction<{
        runId: number;
        code: ReviewErrorCode;
        retryAt: string | null;
      }>,
    ) => {
      const { runId, code, retryAt } = action.payload;
      if (!isRun(state.run, runId)) return;
      state.run = { status: 'failed', code, retryAt };
    },
    failureDismissed: (state) => {
      if (state.run.status === 'failed') state.run = { status: 'idle' };
    },
    quotaUpdated: (state, action: PayloadAction<ReviewQuota | null>) => {
      state.quota = action.payload;
    },
    fixChecked: (
      state,
      action: PayloadAction<{ findingId: string; check: FixCheck }>,
    ) => {
      state.checks[action.payload.findingId] = action.payload.check;
    },
  },
});

const { actions } = protocolReviewSlice;

export default protocolReviewSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors

const selectReview = (state: RootState) => state.protocolReview;

/** The run: idle, running (with progress) or failed (with its code). */
export const getProtocolReviewRun = (state: RootState): ReviewRun =>
  selectReview(state).run;

/**
 * How far a running review has got, from 0 to 0.95, or null when none is
 * running. An estimate from the characters received, by design: it only ever
 * increases, and never reaches the end before the answer does.
 */
export const reviewProgressFraction = (received: number): number =>
  Math.min(0.95, 0.08 + 0.87 * (1 - Math.exp(-received / 5000)));

export const getProtocolReviewProgress = (state: RootState): number | null => {
  const { run } = selectReview(state);
  return run.status === 'running' ? reviewProgressFraction(run.received) : null;
};

/** Whether reviews of this protocol are shared with the team. Off until chosen. */
export const getShareProtocolReviews = (state: RootState): boolean =>
  selectReview(state).record?.shareReviews ?? false;

const selectRecord = (state: RootState) => selectReview(state).record;

/** The stored review of the active protocol: when, and in which language. */
export const getProtocolReviewSummary = createSelector(
  [selectRecord],
  (record) =>
    record?.review
      ? {
          reviewId: record.review.reviewId,
          createdAt: record.review.createdAt,
          locale: record.review.locale,
        }
      : null,
);

/** The quota at `now`: a quota whose reset has passed reads as full. */
export const getProtocolReviewQuota = (
  state: RootState,
  now: number = Date.now(),
): ReviewQuota | null => effectiveQuota(selectReview(state).quota, now);

// The study details come only through the app's selector, which reads the
// experiment's opaque settings tolerantly; undefined means missing or
// incomplete.
const getCurrentFingerprint = createSelector(
  [getProtocol, getProtocolReviewStudyContext],
  (protocol, context) =>
    protocol && context ? reviewFingerprint(protocol, context) : null,
);

export type ReviewStartBlock =
  | { code: 'no_protocol' }
  | { code: 'experiment_off' }
  | { code: 'missing_study_context' }
  | { code: 'running' }
  | { code: 'unchanged' }
  | { code: 'hourly_limit'; resetsAt: string };

/**
 * Why a new review cannot start now, or null when it can. Being offline is not
 * covered: the UI follows that itself.
 */
export const getProtocolReviewStartBlock = (
  state: RootState,
  now: number = Date.now(),
): ReviewStartBlock | null => {
  const protocol = getProtocol(state);
  if (!protocol || getActiveProtocolId(state) === null) {
    return { code: 'no_protocol' };
  }
  if (!getIsProtocolReviewEnabled(state)) return { code: 'experiment_off' };
  if (!getProtocolReviewStudyContext(state)) {
    return { code: 'missing_study_context' };
  }
  if (selectReview(state).run.status === 'running') return { code: 'running' };
  const fingerprint = getCurrentFingerprint(state);
  if (
    fingerprint !== null &&
    selectRecord(state)?.review?.fingerprint === fingerprint
  ) {
    return { code: 'unchanged' };
  }
  const quota = getProtocolReviewQuota(state, now);
  if (quota && quota.remaining <= 0) {
    return { code: 'hourly_limit', resetsAt: quota.resetsAt };
  }
  return null;
};

export type FindingDisplayStatus = 'undecided' | 'fixed' | 'mine' | 'dismissed';

/**
 * Whether "Fix for me" can be offered:
 * - `available`: the edits fit the protocol as it stands and leave it valid;
 * - `checking`: they fit, and whether the result is valid is being worked out
 *   (`checkFixAvailability`);
 * - `changed`: the researcher has changed a place the fix edits since the
 *   review;
 * - `invalid`: the edits do not apply, or leave the protocol invalid;
 * - `none`: the finding came with no edits.
 */
export type FixAvailability =
  | 'available'
  | 'checking'
  | 'changed'
  | 'invalid'
  | 'none';

export type ReviewFindingView = {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  explanation: string;
  fixSummary: string;
  /** The service's own description of each change, for reading before agreeing. */
  fixChanges: string[];
  /** Each text the fix rewrites, now and after. */
  textEdits: FixTextEdit[];
  decision: FindingDecision;
  /** `fixed` only while the researcher chose Fix for me AND the fix holds. */
  status: FindingDisplayStatus;
  /** Meaningful while the status is not `fixed`. */
  availability: FixAvailability;
  /** Whether Fix for me is offered: undecided or mine, and available. */
  canFix: boolean;
  /** Whether the per-finding Undo is offered (fixed, and the inverse applies cleanly to a valid protocol). */
  canUndo: boolean;
  /** Whether it can go back to undecided: mine or dismissed. */
  canRestore: boolean;
  location: FindingLocation;
};

const statusOf = (
  stored: StoredFinding,
  protocol: CurrentProtocol,
): FindingDisplayStatus => {
  // Undecided, mine and dismissed show as they are; a fix shows as fixed only
  // while everything it wrote is as it left it, so the app's own Undo — or
  // the researcher editing what the fix wrote — returns it to undecided.
  if (stored.decision !== 'fix') return stored.decision;
  return stored.written && writtenHolds(protocol, stored.written)
    ? 'fixed'
    : 'undecided';
};

const checkResult = (
  checks: Record<string, FixCheck>,
  findingId: string,
  protocol: CurrentProtocol,
  kind: FixCheck['kind'],
): boolean | null => {
  const check = checks[findingId];
  return check?.protocol === protocol && check.kind === kind
    ? check.valid
    : null;
};

const availabilityOf = (
  stored: StoredFinding,
  protocol: CurrentProtocol,
  checks: Record<string, FixCheck>,
): FixAvailability => {
  if (stored.operations.length === 0) return 'none';
  if (stored.targets === null) return 'invalid';
  if (!fixFits(protocol, stored.operations, stored.targets)) return 'changed';
  const valid = checkResult(checks, stored.finding.id, protocol, 'fix');
  if (valid === null) return 'checking';
  return valid ? 'available' : 'invalid';
};

const undoApplies = (stored: StoredFinding, protocol: CurrentProtocol) =>
  stored.inverse !== null && applyOperations(protocol, stored.inverse).ok;

/**
 * Every finding of the active protocol's review, as the screen shows it, in
 * the service's order (most serious first). Recomputed whenever the protocol
 * changes; validation is the one costly part and is not done here (see
 * `checkFixAvailability`).
 */
export const getProtocolReviewFindings = createSelector(
  [getProtocol, selectRecord, (state: RootState) => selectReview(state).checks],
  (protocol, record, checks): ReviewFindingView[] => {
    if (!protocol || !record?.review) return [];
    return record.review.findings.map((stored) => {
      const { finding } = stored;
      const status = statusOf(stored, protocol);
      const availability =
        status === 'fixed' ? 'none' : availabilityOf(stored, protocol, checks);
      return {
        id: finding.id,
        severity: finding.severity,
        category: finding.category,
        title: finding.title,
        explanation: finding.explanation,
        fixSummary: finding.fix.summary,
        fixChanges: finding.fix.changes,
        textEdits: describeFixTextEdits(protocol, stored.operations),
        decision: stored.decision,
        status,
        availability,
        canFix:
          (status === 'undecided' || status === 'mine') &&
          availability === 'available',
        canUndo:
          status === 'fixed' &&
          undoApplies(stored, protocol) &&
          checkResult(checks, finding.id, protocol, 'undo') === true,
        canRestore: status === 'mine' || status === 'dismissed',
        location: resolveFindingLocation(protocol, finding),
      };
    });
  },
);

export type ReviewFindingCounts = Record<FindingDisplayStatus, number> & {
  total: number;
};

export const getProtocolReviewCounts = createSelector(
  [getProtocolReviewFindings],
  (findings): ReviewFindingCounts => {
    const counts: ReviewFindingCounts = {
      total: findings.length,
      undecided: 0,
      fixed: 0,
      mine: 0,
      dismissed: 0,
    };
    for (const finding of findings) counts[finding.status] += 1;
    return counts;
  },
);

// ---------------------------------------------------------------------------
// Thunks

type GetState = () => RootState;
type Thunk<Result> = (dispatch: AppDispatch, getState: GetState) => Result;

/** The review in flight, outside Redux because its controller is not data. */
type InflightRun = {
  controller: AbortController;
  protocolId: string;
  runId: number;
};

let inflight: InflightRun | null = null;
let lastRunId = 0;

/** Aborts the review in flight and answers which run it was, if any. */
const abortInflight = (): InflightRun | null => {
  const aborted = inflight;
  aborted?.controller.abort();
  inflight = null;
  return aborted;
};

/**
 * Brings the slice into line with the active protocol: reads its record when
 * one becomes active, clears the slice when it closes, and aborts a review in
 * flight for a protocol that is no longer the active one. Dispatched by
 * `keepProtocolReviewOnActiveProtocol` whenever the active protocol id changes.
 */
export const syncProtocolReview =
  (): Thunk<Promise<void>> => async (dispatch, getState) => {
    const protocolId = getActiveProtocolId(getState());
    if (inflight && inflight.protocolId !== protocolId) {
      abortInflight();
    }
    dispatch(actions.reviewCleared());
    dispatch(actions.quotaUpdated(readStoredQuota()));
    if (protocolId === null) return;
    const record = await readReviewRecord(protocolId);
    if (getActiveProtocolId(getState()) === protocolId) {
      dispatch(actions.recordReplaced(record));
      // Nothing has checked this protocol's fixes in this session yet.
      void dispatch(checkFixAvailability());
    }
  };

/**
 * Reads the active protocol's record again, leaving the run alone. For a tab
 * that has just become the protocol's owner: the tab that owned it until now
 * may have saved decisions or a different sharing choice, and the copy this
 * tab holds is from before. A choice of this tab's own that could not be
 * saved still wins (see `readReviewRecord`).
 */
export const refreshProtocolReviewRecord =
  (): Thunk<Promise<void>> => async (dispatch, getState) => {
    const protocolId = getActiveProtocolId(getState());
    if (protocolId === null) return;
    const record = await readReviewRecord(protocolId);
    if (!isStillActive(getState(), protocolId)) return;
    dispatch(actions.recordReplaced(record));
    void dispatch(checkFixAvailability());
  };

/** Whether `protocolId` is still the protocol open in this tab. */
const isStillActive = (state: RootState, protocolId: string) =>
  getActiveProtocolId(state) === protocolId;

/** The active protocol's record, reading it if the slice does not hold it yet. */
const activeRecord = async (
  dispatch: AppDispatch,
  getState: GetState,
  protocolId: string,
): Promise<StoredReviewRecord> => {
  const held = selectRecord(getState());
  if (held?.protocolId === protocolId) return held;
  const record = await readReviewRecord(protocolId);
  if (getActiveProtocolId(getState()) === protocolId) {
    dispatch(actions.recordReplaced(record));
  }
  return record;
};

/**
 * Saves a protocol's review record, and answers whether it did. Only the tab
 * that owns the protocol's saved copy writes anything about its review, as
 * with the protocol itself: a tab that does not own it may be holding a
 * record the owning tab has since changed, the sharing choice included.
 */
const saveRecord = async (
  dispatch: AppDispatch,
  getState: GetState,
  record: StoredReviewRecord,
): Promise<boolean> => {
  if (!getProtocolOwnedHere(getState())) return false;
  if (getActiveProtocolId(getState()) === record.protocolId) {
    dispatch(actions.recordReplaced(record));
  }
  await writeReviewRecord(record);
  return true;
};

export type StartReviewRefusal =
  | 'offline'
  | 'no_protocol'
  | 'experiment_off'
  | 'missing_study_context'
  | 'running'
  | 'unchanged'
  | 'hourly_limit';

export type StartReviewResult =
  | { status: 'refused'; reason: StartReviewRefusal }
  | { status: 'completed'; findingCount: number }
  | { status: 'failed'; code: ReviewErrorCode; retryAt: string | null }
  | { status: 'cancelled' };

const HOUR_MS = 60 * 60 * 1000;

/**
 * The protocol as sent: as the store holds it, without `experiments`. The
 * study details travel in the request's own `studyContext`; fix targets are
 * still recorded against the full protocol.
 */
const protocolForReview = (
  protocol: CurrentProtocol,
): Record<string, unknown> => {
  const { experiments: _experiments, ...rest } = protocol;
  return { ...rest };
};

const refuse = (reason: StartReviewRefusal): StartReviewResult => ({
  status: 'refused',
  reason,
});

/**
 * Reviews the active protocol. Resolves when the review ends, however it
 * ends; the run is in the slice meanwhile, so it survives the popover closing
 * and the researcher moving between pages. The result is saved against the
 * protocol that was SENT — its targets recorded against that protocol, not
 * the one on screen when the answer arrives.
 *
 * `forProtocolId` is the protocol the researcher asked to have reviewed. A
 * caller that waits for anything between that request and this call (the
 * study details wizard saving) passes it, and a different protocol being
 * active by then starts nothing: a review is never sent for a protocol the
 * researcher did not ask about.
 */
export const startReview =
  (forProtocolId?: string): Thunk<Promise<StartReviewResult>> =>
  async (dispatch, getState) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return refuse('offline');
    }
    const protocolId = getActiveProtocolId(getState());
    if (protocolId === null || !getProtocol(getState())) {
      return refuse('no_protocol');
    }
    if (forProtocolId !== undefined && forProtocolId !== protocolId) {
      return { status: 'cancelled' };
    }
    // Only the owning tab reviews: the result could not be saved from here,
    // and the sharing choice this tab holds may be out of date.
    if (!getProtocolOwnedHere(getState())) return { status: 'cancelled' };
    if (inflight) return refuse('running');
    await activeRecord(dispatch, getState, protocolId);

    // Everything sent comes from one protocol at one moment: this state, and
    // only while the protocol the review was asked for is still the active
    // one. A switch while the record was being read sends nothing.
    const state = getState();
    if (!isStillActive(state, protocolId)) return { status: 'cancelled' };
    if (!getProtocolOwnedHere(state)) return { status: 'cancelled' };
    const record = selectRecord(state);
    if (record?.protocolId !== protocolId) return { status: 'cancelled' };
    const block = getProtocolReviewStartBlock(state);
    if (block !== null) return refuse(block.code);
    const protocol = getProtocol(state);
    const studyContext = getProtocolReviewStudyContext(state);
    // The block above has already refused both; this narrows the types.
    if (!protocol || !studyContext) return refuse('missing_study_context');
    if (inflight) return refuse('running');

    const controller = new AbortController();
    lastRunId += 1;
    const run: InflightRun = { controller, protocolId, runId: lastRunId };
    const { runId } = run;
    inflight = run;
    const startedAt = Date.now();
    const fingerprint = reviewFingerprint(protocol, studyContext);
    const locale = getArchitectIntl().locale;
    dispatch(actions.runStarted({ runId, startedAt }));
    captureReviewStarted({ share: record.shareReviews });

    const outcome = await requestReview({
      request: {
        installationId: getReviewInstallationId(),
        locale,
        share: record.shareReviews,
        studyContext,
        protocol: protocolForReview(protocol),
      },
      signal: controller.signal,
      onProgress: (received) => {
        dispatch(actions.runProgress({ runId, received }));
      },
    });

    // Cancelled, or the protocol closed or changed: whoever aborted has reset
    // the run, and nothing is saved for a protocol no longer open.
    if (
      inflight !== run ||
      outcome.kind === 'aborted' ||
      !isStillActive(getState(), protocolId)
    ) {
      if (inflight === run) inflight = null;
      dispatch(actions.runFinished({ runId }));
      return { status: 'cancelled' };
    }
    inflight = null;

    if (outcome.kind === 'error') {
      if (outcome.code === 'hourly_limit') {
        const quota: ReviewQuota = {
          limit:
            selectReview(getState()).quota?.limit ??
            REVIEW_LIMITS.perInstallationPerHour,
          remaining: 0,
          resetsAt:
            outcome.retryAt ?? new Date(Date.now() + HOUR_MS).toISOString(),
        };
        writeStoredQuota(quota);
        dispatch(actions.quotaUpdated(quota));
      }
      dispatch(
        actions.runFailed({
          runId,
          code: outcome.code,
          retryAt: outcome.retryAt,
        }),
      );
      captureReviewFailed(outcome.code);
      return { status: 'failed', code: outcome.code, retryAt: outcome.retryAt };
    }

    const { result } = outcome;
    writeStoredQuota(result.quota);
    dispatch(actions.quotaUpdated(result.quota));
    const findings: StoredFinding[] = result.findings.map(
      (finding: Finding) => ({
        finding,
        ...recordFix(protocol, finding.fix.operations),
        decision: 'undecided',
        inverse: null,
      }),
    );
    // The share choice may have changed while the review ran. The protocol
    // is still the active one (checked above, with no await since), so the
    // slice holds its record.
    const latest = selectRecord(getState());
    await saveRecord(dispatch, getState, {
      protocolId,
      shareReviews:
        latest?.protocolId === protocolId
          ? latest.shareReviews
          : record.shareReviews,
      review: {
        reviewId: result.reviewId,
        createdAt: Date.now(),
        locale,
        fingerprint,
        findings,
      },
    });
    dispatch(actions.runFinished({ runId }));
    void dispatch(checkFixAvailability());
    captureReviewCompleted(
      completedPayload(result.findings, Date.now() - startedAt),
    );
    return { status: 'completed', findingCount: findings.length };
  };

/** Stops the review in flight. Nothing is saved and nothing is counted. */
export const cancelReview = (): Thunk<void> => (dispatch) => {
  const aborted = abortInflight();
  if (aborted) dispatch(actions.runFinished({ runId: aborted.runId }));
};

/** Clears a failed run back to idle. */
export const dismissReviewFailure = (): Thunk<void> => (dispatch, getState) => {
  if (selectReview(getState()).run.status === 'failed') {
    dispatch(actions.failureDismissed());
  }
};

export type DecisionRefusal =
  /** No review is loaded for the active protocol. */
  | 'no_review'
  | 'not_found'
  /** This tab does not own the saved copy, so it may not change the protocol. */
  | 'not_owned'
  /** The fix no longer fits: the researcher changed what it edits. */
  | 'changed'
  /** The edits do not apply, or leave the protocol invalid. */
  | 'invalid'
  /** The fix is applied and holds: Undo it instead. */
  | 'fixed'
  /** Undo was asked of a fix that is not applied. */
  | 'not_fixed';

export type DecisionResult =
  | { ok: true }
  | { ok: false; reason: DecisionRefusal };

const refused = (reason: DecisionRefusal): DecisionResult => ({
  ok: false,
  reason,
});

const findStored = (getState: GetState, findingId: string) => {
  const record = selectRecord(getState());
  const protocolId = getActiveProtocolId(getState());
  if (!record?.review || record.protocolId !== protocolId) return null;
  const stored = record.review.findings.find(
    (candidate) => candidate.finding.id === findingId,
  );
  return stored ? { record, stored } : undefined;
};

const withFinding = (
  record: StoredReviewRecord,
  findingId: string,
  update: Pick<StoredFinding, 'decision' | 'inverse' | 'written'>,
): StoredReviewRecord => ({
  ...record,
  review: record.review
    ? {
        ...record.review,
        findings: record.review.findings.map((stored) =>
          stored.finding.id === findingId ? { ...stored, ...update } : stored,
        ),
      }
    : null,
});

/**
 * Applies a protocol edit as ONE change in the undo history, as long as the
 * protocol is still `from` and this tab owns it. Returns the protocol as the
 * store then holds it.
 */
const commitProtocolEdit = (
  dispatch: AppDispatch,
  getState: GetState,
  from: CurrentProtocol,
  to: CurrentProtocol,
): CurrentProtocol | DecisionRefusal => {
  const state = getState();
  if (!getProtocolOwnedHere(state)) return 'not_owned';
  if (getProtocol(state) !== from) return 'changed';
  dispatch(activeProtocolActions.updateProtocol(protocolReplacement(from, to)));
  return getProtocol(getState()) ?? to;
};

/**
 * Records the researcher's choice for one finding:
 * - `fix` (Fix for me) applies its edits now, as one undoable change;
 * - `mine` (I will fix this) keeps it on the list as theirs to do;
 * - `dismissed` puts it away;
 * - `undecided` restores a finding that was `mine` or `dismissed`.
 *
 * A fix that is applied and holds is taken back with `undoFix`, not here.
 */
export const decideFinding =
  (
    findingId: string,
    decision: FindingDecision,
  ): Thunk<Promise<DecisionResult>> =>
  async (dispatch, getState) => {
    const found = findStored(getState, findingId);
    if (found === null) return refused('no_review');
    if (found === undefined) return refused('not_found');
    const protocol = getProtocol(getState());
    if (!protocol) return refused('no_review');
    if (statusOf(found.stored, protocol) === 'fixed') return refused('fixed');

    if (decision !== 'fix') {
      const saved = await saveRecord(
        dispatch,
        getState,
        withFinding(found.record, findingId, {
          decision,
          inverse: null,
          written: null,
        }),
      );
      if (!saved) return refused('not_owned');
      captureReviewDecision(decisionPayload(decision, found.stored.finding));
      // A finding back on the list needs its fix checked, whatever is on
      // screen: after a reload nothing has checked it yet.
      void dispatch(checkFixAvailability());
      return { ok: true };
    }

    if (!getProtocolOwnedHere(getState())) return refused('not_owned');
    const { stored } = found;
    if (stored.operations.length === 0 || stored.targets === null) {
      return refused('invalid');
    }
    if (!fixFits(protocol, stored.operations, stored.targets)) {
      return refused('changed');
    }
    const edit = await editProtocol(protocol, stored.operations);
    // Another protocol opened while the edit was worked out: nothing here is
    // about it, so nothing is dispatched or saved.
    if (!isStillActive(getState(), found.record.protocolId)) {
      return refused('no_review');
    }
    if (!edit.ok) {
      dispatch(
        actions.fixChecked({
          findingId,
          check: { protocol, kind: 'fix', valid: false },
        }),
      );
      return refused(edit.reason);
    }
    const committed = commitProtocolEdit(
      dispatch,
      getState,
      protocol,
      edit.protocol,
    );
    if (typeof committed === 'string') return refused(committed);

    // The inverse leads back to the protocol it was applied to, which was
    // valid, so Undo is known to be available without another check.
    dispatch(
      actions.fixChecked({
        findingId,
        check: { protocol: committed, kind: 'undo', valid: true },
      }),
    );
    const latest = findStored(getState, findingId);
    await saveRecord(
      dispatch,
      getState,
      withFinding(latest?.record ?? found.record, findingId, {
        decision: 'fix',
        inverse: edit.inverse,
        written: edit.written,
      }),
    );
    captureReviewDecision(decisionPayload('fix', stored.finding));
    return { ok: true };
  };

/**
 * Takes an applied fix back out by applying its inverse, as one undoable
 * change, and returns the finding to undecided. Offered only while the fix
 * holds; refused when the inverse no longer applies or would leave the
 * protocol invalid.
 */
export const undoFix =
  (findingId: string): Thunk<Promise<DecisionResult>> =>
  async (dispatch, getState) => {
    const found = findStored(getState, findingId);
    if (found === null) return refused('no_review');
    if (found === undefined) return refused('not_found');
    const protocol = getProtocol(getState());
    if (!protocol) return refused('no_review');
    const { stored } = found;
    if (statusOf(stored, protocol) !== 'fixed' || stored.inverse === null) {
      return refused('not_fixed');
    }
    if (!getProtocolOwnedHere(getState())) return refused('not_owned');
    const edit = await editProtocol(protocol, stored.inverse);
    // Another protocol opened while the edit was worked out: nothing here is
    // about it, so nothing is dispatched or saved.
    if (!isStillActive(getState(), found.record.protocolId)) {
      return refused('no_review');
    }
    if (!edit.ok) {
      dispatch(
        actions.fixChecked({
          findingId,
          check: { protocol, kind: 'undo', valid: false },
        }),
      );
      return refused(edit.reason);
    }
    const committed = commitProtocolEdit(
      dispatch,
      getState,
      protocol,
      edit.protocol,
    );
    if (typeof committed === 'string') return refused(committed);
    dispatch(
      actions.fixChecked({
        findingId,
        check: { protocol: committed, kind: 'fix', valid: true },
      }),
    );
    const latest = findStored(getState, findingId);
    await saveRecord(
      dispatch,
      getState,
      withFinding(latest?.record ?? found.record, findingId, {
        decision: 'undecided',
        inverse: null,
        written: null,
      }),
    );
    captureReviewDecision(decisionPayload('undecided', stored.finding));
    void dispatch(checkFixAvailability());
    return { ok: true };
  };

/** The researcher's choice about sharing reviews with the team; kept between reviews. */
export const setShareReviews =
  (share: boolean): Thunk<Promise<void>> =>
  async (dispatch, getState) => {
    const protocolId = getActiveProtocolId(getState());
    if (protocolId === null) return;
    const record = await activeRecord(dispatch, getState, protocolId);
    // The choice was made for this protocol; one opened meanwhile is not it.
    if (!isStillActive(getState(), protocolId)) return;
    await saveRecord(dispatch, getState, { ...record, shareReviews: share });
  };

let checking: Promise<void> | null = null;
let checkAgain = false;

/**
 * Whether applying `operations` to `protocol` leaves a valid protocol. Never
 * throws: a finding whose edits cannot even be worked through is not
 * available, and the pass goes on to the next.
 */
const checkEdit = async (
  protocol: CurrentProtocol,
  operations: StoredFinding['operations'],
): Promise<boolean> => {
  try {
    return (await editProtocol(protocol, operations)).ok;
  } catch {
    return false;
  }
};

const runChecks = async (dispatch: AppDispatch, getState: GetState) => {
  const protocol = getProtocol(getState());
  const record = selectRecord(getState());
  if (!protocol || !record?.review) return;
  for (const stored of record.review.findings) {
    // A newer protocol makes the rest of this pass moot; the next pass is
    // asked for by whoever changed it.
    if (getProtocol(getState()) !== protocol) return;
    const { checks } = selectReview(getState());
    const id = stored.finding.id;
    let kind: FixCheck['kind'];
    let operations: StoredFinding['operations'];
    try {
      const status = statusOf(stored, protocol);
      if (status === 'fixed') {
        if (
          stored.inverse === null ||
          checkResult(checks, id, protocol, 'undo') !== null
        ) {
          continue;
        }
        kind = 'undo';
        operations = stored.inverse;
      } else {
        if (
          status === 'dismissed' ||
          availabilityOf(stored, protocol, checks) !== 'checking'
        ) {
          continue;
        }
        kind = 'fix';
        operations = stored.operations;
      }
    } catch {
      dispatch(
        actions.fixChecked({
          findingId: id,
          check: { protocol, kind: 'fix', valid: false },
        }),
      );
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one validation at a time keeps the editor responsive
    const valid = await checkEdit(protocol, operations);
    // The answer is about `protocol` and this review only: if either moved
    // on while it was worked out (another protocol opened, an edit, a new
    // review), it answers nothing now, and whoever moved it asks again.
    const now = selectRecord(getState());
    if (
      getProtocol(getState()) !== protocol ||
      now?.protocolId !== record.protocolId ||
      now.review?.reviewId !== record.review.reviewId
    ) {
      return;
    }
    dispatch(
      actions.fixChecked({ findingId: id, check: { protocol, kind, valid } }),
    );
  }
};

/**
 * Works out, for the protocol as it stands, whether each fitting fix leaves a
 * valid protocol (and whether each applied fix's Undo does), one finding at a
 * time. Until a finding's answer arrives its availability reads `checking`.
 *
 * Call it whenever the findings are on screen and the protocol changes; calls
 * that overlap a pass run one more pass after it, not one each.
 */
export const checkFixAvailability =
  (): Thunk<Promise<void>> => async (dispatch, getState) => {
    if (checking) {
      checkAgain = true;
      await checking;
      return;
    }
    checking = (async () => {
      do {
        checkAgain = false;
        // oxlint-disable-next-line no-await-in-loop -- passes run one after another by design
        await runChecks(dispatch, getState);
      } while (checkAgain);
    })();
    try {
      await checking;
    } finally {
      checking = null;
    }
  };
