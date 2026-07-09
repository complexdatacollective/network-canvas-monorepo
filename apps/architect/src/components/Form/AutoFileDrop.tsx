import { has } from 'es-toolkit/compat';
import { type ReactNode, useCallback, useMemo } from 'react';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import ExternalLink from '~/components/ExternalLink';
import { SUPPORTED_EXTENSION_TYPE_MAP } from '~/config';
import { useAppDispatch } from '~/ducks/hooks';
import {
  importAssetAsync,
  type ImportAssetErrorInfo,
} from '~/ducks/modules/protocol/assetManifest';

import Dropzone from './Dropzone';

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

  return {
    filename,
    message:
      value instanceof Error
        ? value.message
        : 'The file could not be imported.',
  };
};

const documentationMessage = (
  <>
    <p>
      Please see our{' '}
      <ExternalLink href="https://documentation.networkcanvas.com/key-concepts/resources/#supported-file-types">
        documentation page
      </ExternalLink>{' '}
      on using external data by clicking the button below.
    </p>
    <p>
      If you believe you are seeing this message in error, please help us to
      troubleshoot this issue by creating a topic on our&nbsp;
      <ExternalLink href="https://community.networkcanvas.com/">
        community website
      </ExternalLink>
      &nbsp;with further details.
    </p>
    <p>
      <ExternalLink href="https://documentation.networkcanvas.com/key-concepts/resources/#supported-file-types">
        <Button>View documentation</Button>
      </ExternalLink>
    </p>
  </>
);

const getValidationErrorContent = ({
  code,
  message,
}: ImportAssetErrorInfo): ReactNode => {
  if (code === 'VARIABLE_NAME') {
    return (
      <>
        <p>
          The file you attempted to import contained invalid variable names.
        </p>
        <p>{message}</p>
        {documentationMessage}
      </>
    );
  }

  if (code === 'COLUMN_MISMATCHED') {
    return (
      <>
        <p>
          The file you attempted to import contained data with a different
          number of columns to the header row.
        </p>
        <p>{message}</p>
        {documentationMessage}
      </>
    );
  }

  return (
    <>
      <p>
        The file you attempted to import is not in a format supported by
        Interviewer.
      </p>
      <p>{message}</p>
      {documentationMessage}
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
              title: `Warning: ${file.name} contains duplicate rows`,
              children: (
                <>
                  <p>
                    The file contains {result.duplicateCount} duplicate{' '}
                    {result.duplicateCount === 1 ? 'row' : 'rows'}. Duplicate
                    rows will be removed when this roster is used in Fresco.
                  </p>
                  <p>
                    Consider removing duplicates from your CSV file before
                    importing.
                  </p>
                </>
              ),
              actions: { primary: { label: 'OK', value: true } },
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
              ? `Error: ${importError.filename} is not formatted correctly`
              : 'Asset import error',
            children: isValidationError ? (
              getValidationErrorContent(importError)
            ) : (
              <>
                The file <strong>{importError.filename}</strong> could not be
                imported.
                <p>{importError.message}</p>
              </>
            ),
            actions: { primary: { label: 'OK', value: true } },
          });
          return;
        }
      }

      onDrop(ids);
    },
    [dispatch, onDrop, openDialog],
  );

  return (
    <Dropzone
      accepts={accepts}
      onDrop={handleDrop}
      className={className}
      disabled={disabled}
    />
  );
};

export default AutoFileDrop;
