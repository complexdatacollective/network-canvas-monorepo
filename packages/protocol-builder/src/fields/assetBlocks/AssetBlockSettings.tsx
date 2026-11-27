import type { ComponentType } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import {
  BlockDeleteButton,
  type RichTextAssetBlockKind,
  type RichTextAssetBlockViewProps,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';

import {
  DESCRIPTION_HINTS,
  FILE_LABELS,
  messages,
  REMOVE_LABELS,
} from './assetBlockMessages.ts';
import type { KnownAsset } from './AssetBlockView.tsx';

/**
 * A control that shows which file a block is and lets another be chosen in
 * its place: a field's control, given the kind of file the block is. It
 * answers with the id of the file chosen, or with nothing when the file is
 * to go.
 */
export type AssetBlockFileField = ComponentType<
  CreateFormFieldProps<
    string,
    'div',
    {
      kind: RichTextAssetBlockKind;
      onBrowserOpenChange?: (open: boolean) => void;
    }
  >
>;

/**
 * The settings of an image, audio recording or video in a text: its
 * description, whether a recording plays by itself and repeats, the file
 * (chosen with the resource picker that every stage setting uses), and
 * Delete. A picture's size is set by dragging the handle on its corner
 * (`resizeHandle`).
 *
 * The fields are spaced by their own margins, as every list of fields is.
 */
export function AssetBlockSettings({
  asset,
  attributes,
  direction,
  language,
  update,
  remove,
  returnToText,
  FileField,
  onBrowserOpenChange,
}: Pick<
  RichTextAssetBlockViewProps,
  'attributes' | 'update' | 'remove' | 'returnToText'
> & {
  asset: KnownAsset | undefined;
  /** Told when the file field's resource browser opens and closes. */
  onBrowserOpenChange: (open: boolean) => void;
  /** The direction the text runs in where the block sits. */
  direction: 'ltr' | 'rtl';
  /** The language of the text where the block sits, where it says one. */
  language: string | undefined;
  FileField: AssetBlockFileField | undefined;
}) {
  const intl = useAppIntl();
  const kind = asset?.kind;

  return (
    <div className="w-[36rem] max-w-full">
      {kind !== undefined && (
        <UnconnectedField
          name="description"
          component={InputField}
          label={intl.formatMessage(messages.descriptionLabel)}
          hint={intl.formatMessage(DESCRIPTION_HINTS[kind])}
          size="sm"
          // Written in the language of the text the block is in, as the
          // text is, though the settings stand outside it.
          lang={language}
          dir={direction}
          value={attributes.description}
          onChange={(description) => update({ description: description ?? '' })}
        />
      )}
      {(kind === 'audio' || kind === 'video') && (
        <>
          <UnconnectedField
            name="autoplay"
            component={ToggleField}
            label={intl.formatMessage(messages.autoplay)}
            value={attributes.autoplay}
            onChange={(autoplay) => update({ autoplay: autoplay === true })}
          />
          <UnconnectedField
            name="loop"
            component={ToggleField}
            label={intl.formatMessage(messages.loop)}
            value={attributes.loop}
            onChange={(loop) => update({ loop: loop === true })}
          />
        </>
      )}
      {kind !== undefined && FileField !== undefined && (
        <UnconnectedField
          name="file"
          component={FileField}
          label={intl.formatMessage(FILE_LABELS[kind])}
          hint={intl.formatMessage(messages.fileHint)}
          kind={kind}
          onBrowserOpenChange={onBrowserOpenChange}
          value={attributes.assetId}
          onChange={(assetId) => {
            // A block is its file: one whose file is taken away goes too.
            if (assetId === undefined || assetId === '') {
              remove();
              return;
            }
            if (assetId !== attributes.assetId) update({ assetId });
            // The browser took focus, and these controls went with it: the
            // block is drawn again for its new file.
            returnToText();
          }}
        />
      )}
      {/* The last of them, which takes the block away. */}
      <div className="flex justify-end">
        <BlockDeleteButton onClick={remove}>
          {intl.formatMessage(
            kind === undefined ? messages.remove : REMOVE_LABELS[kind],
          )}
        </BlockDeleteButton>
      </div>
    </div>
  );
}
