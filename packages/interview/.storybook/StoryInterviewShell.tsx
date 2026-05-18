'use client';

import { useCallback, useMemo, useState } from 'react';
import SuperJSON from 'superjson';

import {
  type AssetRequestHandler,
  type InterviewPayload,
  isValidAssetType,
  type ResolvedAsset,
  Shell,
  StageMetadataSchema,
  type StepChangeHandler,
} from '../src';

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
  protocol: Omit<InterviewPayload['protocol'], 'assets' | 'importedAt'> & {
    importedAt: Date;
    assets: RawAsset[];
  };
};

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
  };

  return {
    payload: {
      session,
      protocol: {
        ...protocol,
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

const StoryInterviewShell = (props: { rawPayload: string }) => {
  const { payload, initialStep, assetUrls } = useMemo(() => {
    const raw = SuperJSON.parse<RawSyntheticPayload>(props.rawPayload);
    return buildPayload(raw);
  }, [props.rawPayload]);

  const [currentStep, setCurrentStep] = useState<number>(initialStep);

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

  const onSync = useCallback(() => Promise.resolve(), []);
  const onFinish = useCallback(() => Promise.resolve(), []);

  // Wrapping providers (DndStoreProvider, DialogProvider, Toast viewport,
  // MotionConfig, etc.) come from the global decorator in preview.tsx,
  // so this shell only owns the Shell + its props.
  return (
    <Shell
      payload={payload}
      currentStep={currentStep}
      onStepChange={onStepChange}
      onSync={onSync}
      onFinish={onFinish}
      onRequestAsset={onRequestAsset}
      flags={{ isDevelopment: true }}
      analytics={{ installationId: 'storybook', hostApp: 'storybook' }}
      disableAnalytics={true}
    />
  );
};

export default StoryInterviewShell;
