import {
  createElement,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { buttonVariants } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { warnAboutDuplicateRows } from '~/components/AssetBrowser/duplicateRowsWarning';
import ExternalLink from '~/components/ExternalLink';
import { SUPPORTED_EXTENSION_TYPE_MAP } from '~/config';
import { useAppDispatch } from '~/ducks/hooks';
import {
  GENERIC_IMPORT_FAILURE_MESSAGE,
  importAssetAsync,
  type ImportAssetErrorInfo,
} from '~/ducks/modules/protocol/assetManifest';
import { documentationLinks } from '~/utils/documentationLinks';

import Dropzone from './Dropzone/Dropzone';

// Rich-text tag renderers live at module scope so they keep one identity across
// renders (an inline arrow returning JSX is a component defined during render).
const renderResourceTypesLink = (chunks: ReactNode[]) => (
  <ExternalLink href={documentationLinks.supportedResourceTypes}>
    {chunks}
  </ExternalLink>
);

const renderCommunityLink = (chunks: ReactNode[]) => (
  <ExternalLink href="https://community.networkcanvas.com/">
    {chunks}
  </ExternalLink>
);

const renderStrong = (chunks: ReactNode[]) => <strong>{chunks}</strong>;

const additionalMessages = defineMessages({
  genericFailure: {
    id: 'architect.resource.genericImportFailure',
    defaultMessage: 'Check that it is a supported file type, and try again.',
    description:
      'Advice shown in the import error dialog when a file fails to import for an unexpected reason: the file may not be a supported type.',
  },
  pleaseSeeOurDocumentationPageOn: {
    id: 'architect.additional.form.autoFileDrop.pleaseSeeOurDocumentationPageOn',
    defaultMessage:
      'Please see our <ExternalLink> documentation page </ExternalLink> on using external data by clicking the button below.',
    description:
      'Paragraph in the error dialog shown when an imported data file is invalid. ExternalLink wraps the words that link to the documentation page about using external data (CSV or JSON resources).',
  },
  ifYouBelieveYouAreSeeing: {
    id: 'architect.additional.form.autoFileDrop.ifYouBelieveYouAreSeeing',
    defaultMessage:
      'If you believe you are seeing this message in error, please help us to troubleshoot this issue by creating a topic on our <ExternalLink> community website </ExternalLink> with further details.',
    description:
      'Paragraph in the error dialog shown when an imported data file is invalid. ExternalLink wraps the words that link to the Network Canvas community forum, where the researcher can report a problem.',
  },
  viewDocumentation: {
    id: 'architect.additional.form.autoFileDrop.viewDocumentation',
    defaultMessage: 'View documentation',
    description:
      'Button-styled link in the error dialog for an invalid imported data file; opens the documentation page about supported resource types.',
  },
  theFileYouAttemptedToImport: {
    id: 'architect.additional.form.autoFileDrop.theFileYouAttemptedToImport',
    defaultMessage:
      'The file you attempted to import contained invalid attribute names.',
    description:
      'First paragraph of the error dialog when an imported data file has column headings that are not valid variable names. A more specific message follows it.',
  },
  theFileYouAttemptedToImport6eebe: {
    id: 'architect.additional.form.autoFileDrop.theFileYouAttemptedToImport6eebe',
    defaultMessage:
      'The file you attempted to import contained data with a different number of columns to the header row.',
    description:
      'First paragraph of the error dialog when an imported CSV data file has rows with a different number of columns than the heading row. A more specific message follows it.',
  },
  theFileYouAttemptedToImport4c195: {
    id: 'architect.additional.form.autoFileDrop.theFileYouAttemptedToImport4c195',
    defaultMessage:
      'The file you attempted to import is not in a format supported by Interviewer.',
    description:
      'First paragraph of the error dialog when an imported file cannot be read as a supported resource. Interviewer is the Network Canvas interview app. A more specific message follows it.',
  },
});
const messages = defineMessages({
  oK: {
    id: 'architect.form.autoFileDrop.oK',
    defaultMessage: 'OK',
    description:
      'Button that dismisses the error dialog shown when a file import fails.',
  },
  errorIsNotFormattedCorrectly: {
    id: 'architect.form.autoFileDrop.errorIsNotFormattedCorrectly',
    defaultMessage: 'Error: {value1} is not formatted correctly',
    description:
      'Title of the error dialog shown when an imported data file is invalid. value1 is the file name.',
  },
  thatFileCouldNotBeAdded: {
    id: 'architect.form.autoFileDrop.thatFileCouldNotBeAdded',
    defaultMessage: 'That file could not be added',
    description:
      'Title of the error dialog shown when importing a file as a resource fails for a reason other than invalid data formatting.',
  },
  couldNotBeAddedTo: {
    id: 'architect.form.autoFileDrop.couldNotBeAddedTo',
    defaultMessage:
      '<strong>{value1}</strong> could not be added to your resource library.',
    description:
      "First paragraph of the error dialog shown when importing a file fails. strong makes the file name bold. value1 is the file name; the resource library is the researcher's uploaded files.",
  },
});

type AutoFileDropProps = {
  type?: string;
  onDrop: (ids: string[]) => void;
  className?: string;
  disabled?: boolean;
};
const isImportAssetErrorInfo = (
  value: unknown,
): value is ImportAssetErrorInfo =>
  typeof value === 'object' &&
  value !== null &&
  'filename' in value &&
  'message' in value;
const getImportAssetErrorInfo = (
  value: unknown,
  filename: string,
): ImportAssetErrorInfo => {
  if (isImportAssetErrorInfo(value)) {
    return value;
  }
  // A throw that never became an ImportAssetErrorInfo carries an internal
  // message, so it is replaced rather than shown.
  return {
    filename,
    message: GENERIC_IMPORT_FAILURE_MESSAGE,
    localizedMessage: { message: additionalMessages.genericFailure },
  };
};
const DocumentationMessage = () => {
  const intl = useAppIntl();
  return (
    <>
      <Paragraph>
        {intl.formatMessage(
          additionalMessages.pleaseSeeOurDocumentationPageOn,
          {
            ExternalLink: renderResourceTypesLink,
          },
        )}
      </Paragraph>
      <Paragraph>
        {intl.formatMessage(additionalMessages.ifYouBelieveYouAreSeeing, {
          ExternalLink: renderCommunityLink,
        })}
      </Paragraph>
      <Paragraph>
        <ExternalLink
          href={documentationLinks.supportedResourceTypes}
          className={buttonVariants()}
          unstyled
        >
          {intl.formatMessage(additionalMessages.viewDocumentation)}
        </ExternalLink>
      </Paragraph>
    </>
  );
};
const ValidationErrorContent = ({
  error: { code, message, localizedMessage },
}: {
  error: ImportAssetErrorInfo;
}): ReactNode => {
  const intl = useAppIntl();
  if (code === 'VARIABLE_NAME') {
    return (
      <>
        <Paragraph>
          {intl.formatMessage(additionalMessages.theFileYouAttemptedToImport)}
        </Paragraph>
        <Paragraph>
          {localizedMessage ? <AppMessage {...localizedMessage} /> : message}
        </Paragraph>
        <DocumentationMessage />
      </>
    );
  }
  if (code === 'COLUMN_MISMATCHED') {
    return (
      <>
        <Paragraph>
          {intl.formatMessage(
            additionalMessages.theFileYouAttemptedToImport6eebe,
          )}
        </Paragraph>
        <Paragraph>
          {localizedMessage ? <AppMessage {...localizedMessage} /> : message}
        </Paragraph>
        <DocumentationMessage />
      </>
    );
  }
  return (
    <>
      <Paragraph>
        {intl.formatMessage(
          additionalMessages.theFileYouAttemptedToImport4c195,
        )}
      </Paragraph>
      <Paragraph>
        {localizedMessage ? <AppMessage {...localizedMessage} /> : message}
      </Paragraph>
      <DocumentationMessage />
    </>
  );
};
// Exported so the resources list can scope a replacement's file picker to the
// same extensions the drop zone accepts, rather than keeping a second copy of
// the map that could disagree with it.
export const getAccepts = (type?: string): string[] => {
  const match = Object.entries(SUPPORTED_EXTENSION_TYPE_MAP).find(
    ([extensionType]) => extensionType === type,
  );
  return match ? match[1] : Object.values(SUPPORTED_EXTENSION_TYPE_MAP).flat();
};
const AutoFileDrop = ({
  type,
  onDrop,
  className,
  disabled,
}: AutoFileDropProps) => {
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const accepts = useMemo(() => getAccepts(type), [type]);
  // Where focus goes when either dialog below is dismissed.
  //
  // `openDialog` prefers whatever was focused when it was called and uses this
  // as the fallback, which between them covers both ways an import starts:
  // clicking or pressing Enter on the upload control leaves that control
  // focused, so it IS the opener; a file dropped onto the page moves no focus
  // at all, and then this is the only answer. Resolved lazily, when focus is
  // actually being returned.
  const dropzoneRef = useRef<HTMLElement | null>(null);
  const finalFocus = useCallback(() => dropzoneRef.current, []);
  const handleDrop = useCallback(
    async (files: File[]) => {
      const ids: string[] = [];
      for (const file of files) {
        try {
          const result = await dispatch(importAssetAsync({ file })).unwrap();
          ids.push(result.id);
          warnAboutDuplicateRows(openDialog, {
            fileName: file.name,
            duplicateCount: result.duplicateCount,
            finalFocus,
          });
        } catch (error) {
          const importError = getImportAssetErrorInfo(error, file.name);
          const isValidationError =
            importError.code === 'VARIABLE_NAME' ||
            importError.code === 'COLUMN_MISMATCHED';
          void openDialog({
            type: 'acknowledge',
            intent: 'destructive',
            title: isValidationError
              ? createElement(AppMessage, {
                  message: messages.errorIsNotFormattedCorrectly,
                  values: {
                    value1: importError.filename,
                  },
                })
              : createElement(AppMessage, {
                  message: messages.thatFileCouldNotBeAdded,
                }),
            children: isValidationError ? (
              <ValidationErrorContent error={importError} />
            ) : (
              <>
                <Paragraph>
                  {createElement(AppMessage, {
                    message: messages.couldNotBeAddedTo,
                    values: {
                      value1: importError.filename,
                      strong: renderStrong,
                    },
                  })}
                </Paragraph>
                <Paragraph>
                  {importError.localizedMessage ? (
                    <AppMessage {...importError.localizedMessage} />
                  ) : (
                    importError.message
                  )}
                </Paragraph>
              </>
            ),
            actions: {
              primary: {
                label: createElement(AppMessage, { message: messages.oK }),
                value: true,
              },
            },
            finalFocus,
          });
          return;
        }
      }
      onDrop(ids);
    },
    [dispatch, onDrop, openDialog, finalFocus],
  );
  return (
    <Dropzone
      accepts={accepts}
      onDrop={handleDrop}
      className={className}
      disabled={disabled}
      rootRef={dropzoneRef}
    />
  );
};
export default AutoFileDrop;
