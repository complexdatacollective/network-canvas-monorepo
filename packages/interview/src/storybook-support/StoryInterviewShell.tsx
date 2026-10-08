'use client';

import { useCallback, useMemo, useState } from 'react';
import SuperJSON from 'superjson';

import { getLocaleMetadata } from '@codaco/protocol-validation';
import { StageMetadataSchema } from '@codaco/shared-consts';

import {
  type AssetRequestHandler,
  type InterviewPayload,
  isValidAssetType,
  type NavigationOrientation,
  type ResolvedAsset,
  Shell,
  type StepChangeHandler,
  type SyncHandler,
} from '..';

// SyntheticInterview emits assets as plain objects whose `url` field
// (set by stories via `addAsset({ url: '/storybook/roster-100.json' })`)
// is what we resolve `onRequestAsset` against. The shape isn't part of
// the package's public ResolvedAsset type, so we treat each entry as a
// loose record and pull off the fields we need.
type RawAsset = Record<string, unknown>;

type RawSyntheticPayload = {
  id: string;
  startTime: Date;
  finishTime: Date | null;
  exportTime: Date | null;
  lastUpdated: Date;
  currentStep: number;
  stageMetadata?: unknown;
  network: InterviewPayload['session']['network'];
  protocol: Omit<
    InterviewPayload['protocol'],
    'assets' | 'importedAt' | 'localization'
  > & {
    importedAt: Date;
    assets: RawAsset[];
    localization?: InterviewPayload['protocol']['localization'];
  };
};

// Stories built without translations are written in one language that nobody
// named.
const UNSPECIFIED_LOCALIZATION: InterviewPayload['protocol']['localization'] = {
  defaultLocale: 'und',
  locales: ['und'],
};

// Stories render the protocol's default language and the English interface
// whatever languages the browser running them prefers.
const NO_REQUESTED_LOCALES: readonly string[] = [];

// Derive the ResolvedAsset.type from the raw asset record. Stories may
// declare it explicitly via `type:` (preferred), or we fall back to
// inspecting the URL/value fields the way Fresco's preview did.
function inferAssetType(asset: RawAsset): ResolvedAsset['type'] {
  const t = asset.type;
  if (typeof t === 'string' && isValidAssetType(t)) return t;
  if (typeof asset.value === 'string') return 'apikey';
  if (typeof asset.url === 'string' && asset.url.endsWith('.geojson'))
    return 'geojson';
  return 'network';
}

function buildPayload(raw: RawSyntheticPayload): {
  payload: InterviewPayload;
  initialStep: number;
  assetUrls: Record<string, string>;
} {
  const {
    protocol,
    currentStep: _currentStep,
    stageMetadata,
    ...sessionDateFields
  } = raw;

  const assets: ResolvedAsset[] = protocol.assets.flatMap((a) => {
    const assetId = typeof a.assetId === 'string' ? a.assetId : null;
    if (!assetId) return [];
    return [
      {
        assetId,
        name: typeof a.name === 'string' ? a.name : assetId,
        type: inferAssetType(a),
        ...(typeof a.value === 'string' ? { value: a.value } : {}),
      },
    ];
  });

  const assetUrls: Record<string, string> = {};
  for (const a of protocol.assets) {
    const id = typeof a.assetId === 'string' ? a.assetId : null;
    if (id && typeof a.url === 'string') {
      assetUrls[id] = a.url;
    }
  }

  const localization = protocol.localization ?? UNSPECIFIED_LOCALIZATION;

  // SessionState expects ISO date strings (Redux refuses non-serializable
  // values). SyntheticInterview emits live Date objects, so coerce here.
  const parsedStageMetadata = StageMetadataSchema.safeParse(stageMetadata);
  const session: InterviewPayload['session'] = {
    id: sessionDateFields.id,
    startTime: sessionDateFields.startTime.toISOString(),
    finishTime: sessionDateFields.finishTime?.toISOString() ?? null,
    exportTime: sessionDateFields.exportTime?.toISOString() ?? null,
    lastUpdated: sessionDateFields.lastUpdated.toISOString(),
    network: sessionDateFields.network,
    ...(parsedStageMetadata.success
      ? { stageMetadata: parsedStageMetadata.data }
      : {}),
    localePreference: null,
    locale: null,
    localeOptions: localization.locales.map((locale) =>
      getLocaleMetadata(locale),
    ),
  };

  return {
    payload: {
      session,
      protocol: {
        ...protocol,
        localization,
        hash:
          typeof protocol.id === 'string'
            ? `storybook-${protocol.id}`
            : 'storybook-hash',
        importedAt: protocol.importedAt.toISOString(),
        assets,
      },
    },
    initialStep: raw.currentStep,
    assetUrls,
  };
}

const StoryInterviewShell = (props: {
  rawPayload: string;
  hideNavigation?: boolean;
  allowStageNavigation?: boolean;
  /** Force the Navigation orientation instead of deriving it from the
   * viewport aspect ratio, so stories can demonstrate both layouts. */
  navigationOrientation?: NavigationOrientation;
  /** Set for capture stories so dev-only UI (e.g. FamilyPedigree's
   * Dump/Load buttons) never appears in screenshots. */
  isDevelopment?: boolean;
  /** Adds an exit action to the Navigation settings menu when provided, so
   * stories can demonstrate the exit-confirmation flow. */
  onExit?: () => void;
  /** Adds the text-size control to the Navigation settings menu. */
  allowUserScaling?: boolean;
  reviewMode?: boolean;
  initialStep?: number;
  /** Receives the session each time the interview writes it, so a story can
   * check what was stored. */
  onSync?: SyncHandler;
  /** Changes the payload once it is parsed, for what SuperJSON cannot carry
   * (such as an attribute id `__proto__`, which it refuses). */
  preparePayload?: (payload: InterviewPayload) => InterviewPayload;
}) => {
  const { preparePayload } = props;
  const { payload, initialStep, assetUrls } = useMemo(() => {
    const raw = SuperJSON.parse<RawSyntheticPayload>(props.rawPayload);
    const built = buildPayload(raw);
    return preparePayload
      ? { ...built, payload: preparePayload(built.payload) }
      : built;
  }, [props.rawPayload, preparePayload]);

  const [currentStep, setCurrentStep] = useState<number>(
    props.initialStep ?? initialStep,
  );

  const onStepChange = useCallback<StepChangeHandler>((step) => {
    setCurrentStep(step);
  }, []);

  // Resolve to the URL the story declared (served from
  // .storybook/static/storybook). The data: fallback only fires for
  // assets the story mentioned without giving a URL.
  const onRequestAsset: AssetRequestHandler = useCallback(
    (assetId) =>
      Promise.resolve(
        assetUrls[assetId] ??
          `data:text/plain;base64,${btoa(`storybook-asset:${assetId}`)}`,
      ),
    [assetUrls],
  );

  const { onSync: onSyncProp } = props;
  const onSync = useCallback<SyncHandler>(
    (...args) => onSyncProp?.(...args) ?? Promise.resolve(),
    [onSyncProp],
  );
  const onProtocolLocaleChange = useCallback(() => Promise.resolve(), []);
  const onFinish = useCallback(() => Promise.resolve(), []);

  // Wrapping providers (DndStoreProvider, DialogProvider, Toast viewport,
  // MotionConfig, etc.) come from the global decorator in preview.tsx,
  // so this shell only owns the Shell + its props.
  return (
    <Shell
      payload={payload}
      currentStep={currentStep}
      onStepChange={onStepChange}
      requestedLocales={NO_REQUESTED_LOCALES}
      onSync={onSync}
      onProtocolLocaleChange={onProtocolLocaleChange}
      onFinish={onFinish}
      onRequestAsset={onRequestAsset}
      flags={{ isDevelopment: props.isDevelopment ?? true }}
      analytics={{ installationId: 'storybook', hostApp: 'storybook' }}
      disableAnalytics={true}
      hideNavigation={props.hideNavigation}
      navigationOrientation={props.navigationOrientation}
      allowStageNavigation={props.allowStageNavigation}
      allowUserScaling={props.allowUserScaling}
      onExit={props.onExit}
      reviewMode={props.reviewMode}
    />
  );
};

export default StoryInterviewShell;
