import { AlignCenter, AlignLeft, AlignRight, Trash2 } from 'lucide-react';
import type { ComponentType } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type {
  RichTextAssetBlockKind,
  RichTextAssetBlockViewProps,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import SegmentedSwitcherField from '@codaco/fresco-ui/SegmentedSwitcherField';
import { assetBlockAlignmentShows } from '@codaco/protocol-validation';
import type { AssetBlockAlignment } from '@codaco/shared-consts';

import {
  DESCRIPTION_HINTS,
  FILE_LABELS,
  messages,
  SIZE_CHOICES,
  SIZE_LABELS,
  type SizeChoice,
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
  const [StartIcon, EndIcon] =
    direction === 'rtl' ? [AlignRight, AlignLeft] : [AlignLeft, AlignRight];

  // Each field is wrapped, so that each is the last in its parent: a field
  // otherwise keeps a wide space under itself. These keep the closer one
  // between them instead, so that the whole of them fits beside the block in
  // an ordinary window.
  return (
    <div className="flex w-[42rem] max-w-full flex-col gap-4">
      {kind !== undefined && (
        <>
          <div>
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
              onChange={(description) =>
                update({ description: description ?? '' })
              }
            />
          </div>
          {/* How large and where, side by side, their controls on one line;
              one under the other where a language's words leave no room. */}
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            {kind !== 'audio' && (
              <div className="flex-1">
                <UnconnectedField
                  name="size"
                  component={SegmentedSwitcherField<SizeChoice>}
                  size="sm"
                  label={intl.formatMessage(messages.sizeLabel)}
                  hint={intl.formatMessage(messages.sizeHint)}
                  value={attributes.size ?? 'full'}
                  onChange={(choice) => {
                    if (choice === undefined) return;
                    update({ size: choice === 'full' ? null : choice });
                  }}
                  options={SIZE_CHOICES.map((value) => ({
                    value,
                    label: intl.formatMessage(SIZE_LABELS[value]),
                  }))}
                />
              </div>
            )}
            {assetBlockAlignmentShows(kind, attributes.size) && (
              <div className="flex-none">
                <UnconnectedField
                  name="align"
                  component={SegmentedSwitcherField<AssetBlockAlignment>}
                  size="sm"
                  label={intl.formatMessage(messages.alignLabel)}
                  value={attributes.align}
                  onChange={(align) => {
                    if (align !== undefined) update({ align });
                  }}
                  options={[
                    {
                      value: 'start',
                      icon: StartIcon,
                      label: (
                        <span className="sr-only" lang="en">
                          {'Align to the start'}
                        </span>
                      ),
                    },
                    {
                      value: 'center',
                      icon: AlignCenter,
                      label: (
                        <span className="sr-only" lang="en">
                          {'Align to the center'}
                        </span>
                      ),
                    },
                    {
                      value: 'end',
                      icon: EndIcon,
                      label: (
                        <span className="sr-only" lang="en">
                          {'Align to the end'}
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </div>
        </>
      )}
      {(kind === 'audio' || kind === 'video') && (
        <div className="grid grid-cols-2 gap-x-6">
          <div>
            <UnconnectedField
              name="autoplay"
              component={ToggleField}
              label={intl.formatMessage(messages.autoplay)}
              value={attributes.autoplay}
              onChange={(autoplay) => update({ autoplay: autoplay === true })}
            />
          </div>
          <div>
            <UnconnectedField
              name="loop"
              component={ToggleField}
              label={intl.formatMessage(messages.loop)}
              value={attributes.loop}
              onChange={(loop) => update({ loop: loop === true })}
            />
          </div>
        </div>
      )}
      {/* The file, and Delete on the line of its button: the last line of
          them, which takes the block away, file and all. */}
      <div className="flex flex-wrap items-end justify-end gap-x-3 gap-y-4">
        {kind !== undefined && FileField !== undefined && (
          <div className="min-w-0 flex-1 basis-80">
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
          </div>
        )}
        <Button
          type="button"
          size="sm"
          color="destructive"
          icon={<Trash2 aria-hidden />}
          onClick={remove}
        >
          {intl.formatMessage(messages.remove)}
        </Button>
      </div>
    </div>
  );
}
