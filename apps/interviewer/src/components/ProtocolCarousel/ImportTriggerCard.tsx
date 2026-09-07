import { Upload } from 'lucide-react';
import type { DropzoneState } from 'react-dropzone';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { ExternalLink } from '../ExternalLink';
import { CARD_RADIUS_PX, cardBase, cardHeadingSizeClass } from './cardStyles';

const messages = defineMessages({
  chooseANetcanvasProtocolFile: {
    id: 'interviewer.importTriggerCard.chooseANetcanvasProtocolFile',
    defaultMessage: 'Choose a .netcanvas protocol file',
    description: 'User-facing message in Interviewer Import Trigger Card.',
  },
  importAProtocol: {
    id: 'interviewer.importTriggerCard.importAProtocol',
    defaultMessage: 'Import a protocol',
    description: 'The aria-label label in Interviewer Import Trigger Card.',
  },
  drop: {
    id: 'interviewer.importTriggerCard.drop',
    defaultMessage:
      'Drop a <extension>.netcanvas</extension> file, or click to browse',
    description:
      'Import instructions; preserve the literal .netcanvas file extension inside the styled tag.',
  },
  authoring: {
    id: 'interviewer.importTriggerCard.authoring',
    defaultMessage: 'Protocols are authored in <link>Architect</link>.',
    description:
      'Explains where protocols are created; Architect is a product name and link.',
  },
});

type ImportTriggerCardProps = {
  // Carousel activation (click / Enter on the active card): opens the file
  // picker. On a non-active card the carousel intercepts this to navigate.
  onActivate: () => void;
  getRootProps: DropzoneState['getRootProps'];
  getInputProps: DropzoneState['getInputProps'];
  isDragActive: boolean;
};

// The always-last card in the deck. The card itself is the import surface —
// click it to open the file picker, or drop a `.netcanvas` file onto it. The
// frosted-glass look (backdrop-blur) is applied by DeckCarousel's slide
// wrapper, not here: backdrop-filter doesn't propagate through the card's own
// transform, so the (separately transformed) wrapper reads the blob backdrop.
export function ImportTriggerCard({
  onActivate,
  getRootProps,
  getInputProps,
  isDragActive,
}: ImportTriggerCardProps) {
  const intl = useAppIntl();
  const importHeading = intl.formatMessage(messages.importAProtocol);
  const rootProps = getRootProps({
    // Match the protocol card's radius so the visual footprint (and
    // therefore perceived size) is identical.
    style: { borderRadius: CARD_RADIUS_PX },
    className: cx(
      'text-text/80 effect-shadow-xl @container relative h-full w-full border-[3px] border-dashed transition-colors duration-180',
      isDragActive
        ? 'border-sea-green bg-[color-mix(in_oklab,oklch(var(--sea-green))_20%,var(--surface))]'
        : 'border-outline bg-surface/50',
    ),
  });
  return (
    <div {...rootProps}>
      <input
        {...getInputProps({
          'aria-label': intl.formatMessage(
            messages.chooseANetcanvasProtocolFile,
          ),
        })}
        data-testid="protocol-import-input"
      />
      {/* The button fills the whole card so a click anywhere on it — not just
          the centred content — opens the picker. The note below overlays the
          bottom with pointer-events disabled so its (non-link) area falls
          through to the button too, keeping the entire surface clickable. */}
      <button
        type="button"
        onClick={onActivate}
        aria-label={intl.formatMessage(messages.importAProtocol)}
        className={cx(
          cardBase(),
          'absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[inherit] px-8 pb-12 text-center',
        )}
      >
        <span
          aria-hidden
          className="bg-surface text-sea-green inline-flex size-[clamp(52px,17.5cqi,84px)] items-center justify-center rounded-full"
        >
          <Upload
            className="size-[clamp(24px,7.5cqi,36px)]"
            strokeWidth={2.5}
            aria-hidden
          />
        </span>
        <Heading
          level="h2"
          margin="none"
          className={cx(
            'text-text font-black',
            cardHeadingSizeClass(importHeading),
          )}
        >
          {importHeading}
        </Heading>
        <span className="text-sm">
          {intl.formatMessage(messages.drop, {
            extension: (chunks) => (
              <span className="font-monospace text-text">{chunks}</span>
            ),
          })}
        </span>
      </button>
      <p className="text-text/70 pointer-events-none absolute inset-x-0 bottom-0 px-8 pb-6 text-center text-xs">
        {intl.formatMessage(messages.authoring, {
          link: (chunks) => (
            <span className="pointer-events-auto">
              <ExternalLink href="https://architect.networkcanvas.com">
                {chunks}
              </ExternalLink>
            </span>
          ),
        })}
      </p>
    </div>
  );
}
