import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  RichTextAssetBlockKind,
  RichTextAssetBlocks,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { assetBlockFile } from '@codaco/protocol-validation';

import { useResourceClient } from '../../resources/client.tsx';
import ResourceBrowserDialog from '../../resources/components/ResourceBrowserDialog.tsx';
import ResourcePreview from '../../resources/components/ResourcePreview.tsx';
import type { ResourceDescriptor } from '../../resources/types.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import AssetPickerField from '../AssetPickerField.tsx';
import { takeChosenResource } from '../chosenResource.ts';
import { ResourceRefusal } from '../ResourceRefusal.tsx';
import type { AssetBlockFileField } from './AssetBlockSettings.tsx';
import { createAssetBlockView, type KnownAsset } from './AssetBlockView.tsx';

const useStageAsset = (assetId: string): KnownAsset | undefined =>
  assetBlockFile(useProtocolContext().assets, assetId);

/**
 * The resource picker, as the settings of a block in a stage editor offer it:
 * on one line, without a second drawing of the file, which the block draws
 * just above, and without a discard of its own, since the settings delete the
 * block.
 */
const StageAssetBlockFileField: AssetBlockFileField = (props) => (
  <AssetPickerField {...props} layout="line" />
);

/** A block in a stage editor, drawn from the resources of the open edit. */
const StageAssetBlockView = createAssetBlockView({
  FileField: StageAssetBlockFileField,
  useAsset: useStageAsset,
  Preview: ({ assetId, kind, name, className }) => (
    <ResourcePreview
      resourceId={assetId}
      kind={kind}
      name={name}
      className={className}
    />
  ),
});

type PickRequest = Readonly<{
  kind: RichTextAssetBlockKind;
  resolve: (assetId: string | undefined) => void;
}>;

/**
 * What a text field in a stage editor gives its editor so the text can hold
 * files as blocks: `assetBlocks` for the editor, and `picker` to draw beside
 * it, which is the resource browser the editor's buttons open. Choosing a
 * file there, or importing one, puts it in the text; closing it puts nothing.
 *
 * `undefined` blocks when the field does not hold them (`enabled`), so a
 * field declared without blocks offers none.
 */
export function useStageAssetBlocks(enabled: boolean): Readonly<{
  assetBlocks: RichTextAssetBlocks | undefined;
  picker: ReactNode;
}> {
  const [request, setRequest] = useState<PickRequest | null>(null);
  const requestRef = useRef<PickRequest | null>(null);
  const [refusal, setRefusal] = useState<string | undefined>(undefined);

  const settle = useCallback((assetId: string | undefined) => {
    requestRef.current?.resolve(assetId);
    requestRef.current = null;
    setRequest(null);
  }, []);

  // A field that goes away while its browser is open chose nothing.
  useEffect(() => () => requestRef.current?.resolve(undefined), []);

  const pick = useCallback(
    (kind: RichTextAssetBlockKind) =>
      new Promise<string | undefined>((resolve) => {
        // Asked again before answering: the earlier asking chose nothing.
        requestRef.current?.resolve(undefined);
        const next = { kind, resolve };
        requestRef.current = next;
        setRefusal(undefined);
        setRequest(next);
      }),
    [],
  );

  const assetBlocks = useMemo(
    (): RichTextAssetBlocks | undefined =>
      enabled ? { pick, View: StageAssetBlockView } : undefined,
    [enabled, pick],
  );

  return {
    assetBlocks,
    picker: enabled ? (
      <StageAssetBlockPicker
        request={request}
        refusal={refusal}
        onRefused={(message) => {
          setRefusal(message);
          settle(undefined);
        }}
        onSettled={settle}
      />
    ) : null,
  };
}

function StageAssetBlockPicker({
  request,
  refusal,
  onRefused,
  onSettled,
}: {
  request: PickRequest | null;
  refusal: string | undefined;
  onRefused: (message: string) => void;
  onSettled: (assetId: string | undefined) => void;
}) {
  const resources = useResourceClient();
  // The kind last asked for, so the browser keeps its wording as it closes.
  const [lastKind, setLastKind] = useState<RichTextAssetBlockKind>('image');
  if (request !== null && request.kind !== lastKind) setLastKind(request.kind);
  const kind = request?.kind ?? lastKind;

  const handleSelect = (chosen: ResourceDescriptor) => {
    const taken = takeChosenResource(resources, kind, chosen);
    if (taken.status === 'refused') onRefused(taken.message);
    else onSettled(taken.id);
  };

  return (
    <>
      <ResourceBrowserDialog
        open={request !== null}
        kind={kind}
        onSelect={handleSelect}
        onClose={() => onSettled(undefined)}
      />
      {refusal !== undefined && <ResourceRefusal message={refusal} />}
    </>
  );
}

/**
 * A stage's text field that may hold files as blocks. `children` draws the
 * field, handed what lets its text hold them (`undefined` when it holds
 * none); the browser a block's file is chosen in follows it.
 */
export function StageAssetBlocks({
  enabled,
  children,
}: Readonly<{
  /** Whether the field's text holds files as blocks. */
  enabled: boolean;
  children: (assetBlocks: RichTextAssetBlocks | undefined) => ReactNode;
}>) {
  const { assetBlocks, picker } = useStageAssetBlocks(enabled);
  return (
    <>
      {children(assetBlocks)}
      {picker}
    </>
  );
}
