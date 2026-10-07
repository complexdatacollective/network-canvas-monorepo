import { ArrowLeftToLine, Maximize, Minimize, Redo, Undo } from 'lucide-react';
import { Link } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button, { IconButton } from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';
import TranslationTable from '~/components/Localization/TranslationTable';
import { routeFocusTargetProps } from '~/components/RouteFocus';
import { useFullscreen } from '~/hooks/useFullscreen';
import { useProtocolUndoRedo } from '~/hooks/useProtocolUndoRedo';
import { cx } from '~/utils/cva';

const messages = defineMessages({
  title: {
    id: 'architect.pages.translationTablePage.title',
    defaultMessage: 'Translation table',
    description:
      'Title of the page, opened from the Languages page, that shows every participant-facing text of a protocol beside its translation into each language.',
  },
  returnToLanguages: {
    id: 'architect.pages.translationTablePage.returnToLanguages',
    defaultMessage: 'Return to Languages',
    description:
      'Link in the toolbar of the translation table back to the Languages page, which opened it. “Languages” is the name of that page in the project navigation.',
  },
  undo: {
    id: 'architect.pages.translationTablePage.undo',
    defaultMessage: 'Undo',
    description:
      'Accessible name of the button in the toolbar of the translation table that undoes the last change to the protocol.',
  },
  redo: {
    id: 'architect.pages.translationTablePage.redo',
    defaultMessage: 'Redo',
    description:
      'Accessible name of the button in the toolbar of the translation table that redoes the last change undone.',
  },
  fullScreen: {
    id: 'architect.pages.translationTablePage.fullScreen',
    defaultMessage: 'Full screen',
    description:
      'Button in the toolbar of the translation table that makes the table and its toolbar fill the screen.',
  },
  exitFullScreen: {
    id: 'architect.pages.translationTablePage.exitFullScreen',
    defaultMessage: 'Exit full screen',
    description:
      'The same button while the translation table fills the screen, which returns it to the window.',
  },
});

// The table fills what the project navigation leaves of the window, or the
// whole screen, and scrolls within itself so its headings stay in view. Its
// toolbar carries the way back and the history controls the floating toolbar
// offers on other pages, which this one leaves out so it never covers rows.
const TranslationTablePage = () => {
  const intl = useAppIntl();
  const fullscreen = useFullscreen();
  const { canUndo, canRedo, undo, redo } = useProtocolUndoRedo();

  return (
    <div
      className={cx(
        'phone-landscape:px-5 flex min-h-0 flex-1 flex-col px-3 pt-1 pb-3',
        // Over the rest of the app, which stays mounted beneath it, and under
        // the layer menus and dialogs open in.
        fullscreen.active && 'bg-background fixed inset-0 z-50 pt-3',
      )}
    >
      <TranslationTable
        heading={
          <div className="flex items-center gap-1">
            <Heading
              level="h1"
              margin="none"
              className="me-1 text-lg"
              {...routeFocusTargetProps}
            >
              {intl.formatMessage(messages.title)}
            </Heading>
            <Button
              asChild
              size="sm"
              variant="text"
              icon={<ArrowLeftToLine aria-hidden />}
              className="px-3"
            >
              <Link href="/protocol/localization">
                {intl.formatMessage(messages.returnToLanguages)}
              </Link>
            </Button>
          </div>
        }
        actions={
          <>
            <IconButton
              size="sm"
              variant="text"
              icon={<Undo aria-hidden />}
              aria-label={intl.formatMessage(messages.undo)}
              disabled={!canUndo}
              onClick={undo}
            />
            <IconButton
              size="sm"
              variant="text"
              icon={<Redo aria-hidden />}
              aria-label={intl.formatMessage(messages.redo)}
              disabled={!canRedo}
              onClick={redo}
            />
            {fullscreen.supported && (
              <Button
                size="sm"
                variant="outline"
                className="px-3"
                icon={
                  fullscreen.active ? (
                    <Minimize aria-hidden />
                  ) : (
                    <Maximize aria-hidden />
                  )
                }
                onClick={fullscreen.toggle}
              >
                {intl.formatMessage(
                  fullscreen.active
                    ? messages.exitFullScreen
                    : messages.fullScreen,
                )}
              </Button>
            )}
          </>
        }
      />
    </div>
  );
};

export default TranslationTablePage;
