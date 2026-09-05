import { has } from 'es-toolkit/compat';
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
const additionalMessages = defineMessages({
  genericFailure: {
    id: 'architect.resource.genericImportFailure',
    defaultMessage: 'Check that it is a supported file type, and try again.',
    description:
      'Generic resource-import guidance for unexpected exception messages.',
  },
  pleaseSeeOurDocumentationPageOn: {
    id: 'architect.additional.form.autoFileDrop.pleaseSeeOurDocumentationPageOn',
    defaultMessage:
      'Please see our <ExternalLink> documentation page </ExternalLink> on using external data by clicking the button below.',
    description: 'Visible text in components / Form / AutoFileDrop.',
  },
  ifYouBelieveYouAreSeeing: {
    id: 'architect.additional.form.autoFileDrop.ifYouBelieveYouAreSeeing',
    defaultMessage:
      'If you believe you are seeing this message in error, please help us to troubleshoot this issue by creating a topic on our <ExternalLink> community website </ExternalLink> with further details.',
    description: 'Visible text in components / Form / AutoFileDrop.',
  },
  viewDocumentation: {
    id: 'architect.additional.form.autoFileDrop.viewDocumentation',
    defaultMessage: 'View documentation',
    description: 'Visible text in components / Form / AutoFileDrop.',
  },
  theFileYouAttemptedToImport: {
    id: 'architect.additional.form.autoFileDrop.theFileYouAttemptedToImport',
    defaultMessage:
      'The file you attempted to import contained invalid attribute names.',
    description: 'Visible text in components / Form / AutoFileDrop.',
  },
  theFileYouAttemptedToImport6eebe: {
    id: 'architect.additional.form.autoFileDrop.theFileYouAttemptedToImport6eebe',
    defaultMessage:
      'The file you attempted to import contained data with a different number of columns to the header row.',
    description: 'Visible text in components / Form / AutoFileDrop.',
  },
  theFileYouAttemptedToImport4c195: {
    id: 'architect.additional.form.autoFileDrop.theFileYouAttemptedToImport4c195',
    defaultMessage:
      'The file you attempted to import is not in a format supported by Interviewer.',
    description: 'Visible text in components / Form / AutoFileDrop.',
  },
});
const messages = defineMessages({
  warningContainsDuplicateRows: {
    id: 'architect.form.autoFileDrop.warningContainsDuplicateRows',
    defaultMessage: 'Warning: {value1} contains duplicate rows',
    description: 'The title text in components / Form / AutoFileDrop.',
  },
  theFileContainsDuplicateDuplicate: {
    id: 'architect.form.autoFileDrop.theFileContainsDuplicateDuplicate',
    defaultMessage:
      'The file contains {value1} duplicate {value2, plural, one {row} other {rows}}. Duplicate rows will be removed when this roster is used in Fresco.',
    description: 'Visible text in components / Form / AutoFileDrop.',
  },
  considerRemovingDuplicatesFromYourCSV: {
    id: 'architect.form.autoFileDrop.considerRemovingDuplicatesFromYourCSV',
    defaultMessage:
      'Consider removing duplicates from your CSV file before importing.',
    description: 'Visible text in components / Form / AutoFileDrop.',
  },
  oK: {
    id: 'architect.form.autoFileDrop.oK',
    defaultMessage: 'OK',
    description: 'The label text in components / Form / AutoFileDrop.',
  },
  errorIsNotFormattedCorrectly: {
    id: 'architect.form.autoFileDrop.errorIsNotFormattedCorrectly',
    defaultMessage: 'Error: {value1} is not formatted correctly',
    description: 'The title text in components / Form / AutoFileDrop.',
  },
  thatFileCouldNotBeAdded: {
    id: 'architect.form.autoFileDrop.thatFileCouldNotBeAdded',
    defaultMessage: 'That file could not be added',
    description: 'The title text in components / Form / AutoFileDrop.',
  },
  couldNotBeAddedTo: {
    id: 'architect.form.autoFileDrop.couldNotBeAddedTo',
    defaultMessage:
      '<strong>{value1}</strong> could not be added to your resource library.',
    description: 'Visible text in components / Form / AutoFileDrop.',
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
            ExternalLink: (chunks) => (
              <ExternalLink href={documentationLinks.supportedResourceTypes}>
                {chunks}
              </ExternalLink>
            ),
          },
        )}
      </Paragraph>
      <Paragraph>
        {intl.formatMessage(additionalMessages.ifYouBelieveYouAreSeeing, {
          ExternalLink: (chunks) => (
            <ExternalLink href="https://community.networkcanvas.com/">
              {chunks}
            </ExternalLink>
          ),
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
const getAccepts = (type?: string): string[] => {
  if (!type || !has(SUPPORTED_EXTENSION_TYPE_MAP, type)) {
    return Object.values(SUPPORTED_EXTENSION_TYPE_MAP).flat();
  }
  const extensionKey = type as keyof typeof SUPPORTED_EXTENSION_TYPE_MAP;
  const extensions = SUPPORTED_EXTENSION_TYPE_MAP[extensionKey];
  return Array.isArray(extensions)
    ? extensions
    : Array.from(extensions as Iterable<string>);
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
          const result = await dispatch(importAssetAsync(file)).unwrap();
          ids.push(result.id);
          if (result.duplicateCount > 0) {
            void openDialog({
              type: 'acknowledge',
              intent: 'warning',
              title: createElement(AppMessage, {
                message: messages.warningContainsDuplicateRows,
                values: {
                  value1: file.name,
                },
              }),
              children: (
                <>
                  <Paragraph>
                    {createElement(AppMessage, {
                      message: messages.theFileContainsDuplicateDuplicate,
                      values: {
                        value1: result.duplicateCount,
                        value2: result.duplicateCount,
                      },
                    })}
                  </Paragraph>
                  <Paragraph>
                    {createElement(AppMessage, {
                      message: messages.considerRemovingDuplicatesFromYourCSV,
                    })}
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
          }
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
                      strong: (chunks) => <strong>{chunks}</strong>,
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
