'use client';

import { queue } from 'async';
import { useCallback, useRef } from 'react';

import {
  createAppIntl,
  createMessageError,
  defineMessages,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import { AppErrorMessage, AppMessage } from '@codaco/app-i18n/react';
import Spinner from '@codaco/fresco-ui/Spinner';
import { useToast } from '@codaco/fresco-ui/Toast';
import {
  MalformedNetcanvasError,
  hashProtocol,
} from '@codaco/protocol-validation';
import { describeProtocolFileErrorMessage } from '@codaco/protocol-validation/messages';
import { ensureError } from '@codaco/shared-consts';
import {
  cleanupUploadedFiles,
  getNewAssetIds,
  getProtocolByHash,
  insertProtocol,
} from '~/actions/protocols';
import {
  calculateImportProgress,
  type ImportPhase,
} from '~/components/ProtocolImport/calculateImportProgress';
import ImportToastContent from '~/components/ProtocolImport/ImportToastContent';
import { APP_SUPPORTED_SCHEMA_VERSIONS } from '~/fresco.config';
import { useUploadAssets } from '~/hooks/useUploadAssets';
import {
  captureClientEvent,
  captureClientException,
} from '~/lib/posthog-client';
import {
  validateAndMigrateProtocol,
  type ProtocolValidationError,
} from '~/lib/protocol/validateAndMigrateProtocol';
import { type AssetInsertType } from '~/schemas/protocol';
import { DatabaseError } from '~/utils/databaseError';
import {
  fileAsArrayBuffer,
  getProtocolAssets,
  getProtocolJson,
} from '~/utils/protocolImport';
import { getProtocolSizeError } from '~/utils/protocolSize';

const messages = defineMessages({
  operationalFailure: {
    id: 'fresco.protocolImport.operationalFailure',
    defaultMessage:
      'The protocol could not be imported. Check your connection and storage configuration, then try again.',
    description:
      'Retry guidance for lookup, storage, or persistence failures after reading a protocol; does not claim that the protocol file is invalid.',
  },
  protocolMismatch: {
    id: 'fresco.protocolImport.protocolMismatch',
    defaultMessage:
      'The uploaded protocol file did not match the requested file.',
    description:
      'Researcher-facing protocolImport: The uploaded protocol file did not match the requested file.',
  },

  checkAssets: {
    id: 'fresco.protocolImport.checkAssets',
    defaultMessage: 'Could not check for existing assets.',
    description:
      'Researcher-facing protocolImport: Could not check for existing assets.',
  },

  importedName: {
    id: 'fresco.protocolImport.importedName',
    defaultMessage: '{name} has been imported.',
    description: 'Researcher-facing protocolImport: name has been imported.',
  },

  missingDependencies: {
    id: 'fresco.protocolImport.validation.missingDependencies',
    defaultMessage: 'Migration failed: missing {dependencies}.',
    description:
      'Researcher-facing protocolImport.validation: Migration failed: missing dependencies.',
  },

  validationFailed: {
    id: 'fresco.protocolImport.validation.validationFailed',
    defaultMessage:
      'The protocol is invalid. Please check the protocol structure.',
    description:
      'Researcher-facing protocolImport.validation: The protocol is invalid. Please check the protocol structure.',
  },

  unsupportedVersion: {
    id: 'fresco.protocolImport.validation.unsupportedVersion',
    defaultMessage:
      'Protocol version not supported. Fresco supports {count, plural, one {version} other {versions}} {versions}.',
    description:
      'Researcher-facing protocolImport.validation: Protocol version not supported. Fresco supports count, plural, one version other versions versions.',
  },

  invalidProtocol: {
    id: 'fresco.protocolImport.validation.invalidProtocol',
    defaultMessage: 'The uploaded file does not contain a valid protocol.',
    description:
      'Researcher-facing protocolImport.validation: The uploaded file does not contain a valid protocol.',
  },

  copyImportCompleted: {
    id: 'fresco.hooks.useProtocolImport.copyImportCompleted',
    defaultMessage: 'Import completed!',
    description:
      'Researcher-facing hooks / useProtocolImport: Import completed!',
  },
  copyAssetUploadFailed: {
    id: 'fresco.hooks.useProtocolImport.copyAssetUploadFailed',
    defaultMessage: 'Asset upload failed',
    description:
      'Researcher-facing hooks / useProtocolImport: Asset upload failed',
  },
  protocolImportedSuccessfully: {
    id: 'fresco.hooks.useProtocolImport.protocolImportedSuccessfully',
    defaultMessage: 'Protocol imported successfully',
    description:
      'Researcher-facing hooks / useProtocolImport: Protocol imported successfully',
  },
  protocolAlreadyExistsDeleteTheExistingProtocol: {
    id: 'fresco.hooks.useProtocolImport.protocolAlreadyExistsDeleteTheExistingProtocol',
    defaultMessage:
      'Protocol already exists. Delete the existing protocol first before importing again.',
    description:
      'Researcher-facing hooks / useProtocolImport: Protocol already exists. Delete the existing protocol first before importing again.',
  },
});

function getValidationErrorMessage(
  validationError: ProtocolValidationError,
): string {
  switch (validationError.error) {
    case 'invalid-object':
      return createMessageError(messages.invalidProtocol);
    case 'unsupported-version':
      return createMessageError(messages.unsupportedVersion, {
        count: APP_SUPPORTED_SCHEMA_VERSIONS.length,
        versions: { list: APP_SUPPORTED_SCHEMA_VERSIONS.map(String) },
      });
    case 'validation-failed':
      return createMessageError(messages.validationFailed);
    case 'missing-dependencies':
      return createMessageError(messages.missingDependencies, {
        dependencies: { list: validationError.missingDependencies },
      });
  }
}

function generateJobId(): string {
  return `import-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const useProtocolImport = () => {
  const { add, update, close } = useToast();
  const { uploadAssets } = useUploadAssets();
  const activeJobs = useRef<Set<string>>(new Set());
  // Store refs to toast manager functions so the queue callback can access them
  // without being recreated when toast manager changes
  const toastRef = useRef({ add, update, close });
  toastRef.current = { add, update, close };

  const updateToastPhase = (
    toastId: string,
    phase: ImportPhase,
    {
      phaseProgress = 0,
      error,
      onRetry,
      displayName,
    }: {
      phaseProgress?: number;
      error?: string | null;
      onRetry?: () => void;
      displayName?: string;
    } = {},
  ) => {
    const progress = calculateImportProgress(phase, phaseProgress);
    const { update: toastUpdate } = toastRef.current;

    if (phase === 'complete') {
      toastUpdate(toastId, {
        variant: 'success',
        title: <AppMessage message={messages.protocolImportedSuccessfully} />,
        description: displayName ? (
          <AppMessage
            message={messages.importedName}
            values={{
              name: displayName,
            }}
          />
        ) : (
          <AppMessage message={messages.copyImportCompleted} />
        ),
        icon: null,
        timeout: 2000,
      });
      return;
    }

    if (phase === 'error') {
      toastUpdate(toastId, {
        variant: 'destructive',
        icon: null,
        description: (
          <ImportToastContent
            phase={phase}
            progress={progress}
            error={error}
            onRetry={onRetry}
          />
        ),
        timeout: 0,
      });
      return;
    }

    toastUpdate(toastId, {
      description: <ImportToastContent phase={phase} progress={progress} />,
    });
  };

  const processJob = async ({
    file,
    toastId,
  }: {
    file: File;
    toastId: string;
  }) => {
    const fileName = file.name;
    const protocolName = fileName.replace(/\.netcanvas$/i, '');

    const retryThisFile = () => {
      importProtocols([file]);
    };

    // Storage keys of every blob uploaded during this attempt, so they can be
    // cleaned up on a best-effort basis if the import fails partway through.
    const uploadedKeys: string[] = [];

    try {
      // Phase: Parsing
      updateToastPhase(toastId, 'parsing');
      const fileArrayBuffer = await fileAsArrayBuffer(file, createMessageError);

      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(fileArrayBuffer).catch(
        (cause: unknown) => {
          throw new MalformedNetcanvasError(
            'not-an-archive',
            'Protocol archive could not be read',
            { cause },
          );
        },
      );
      const protocolJson = await getProtocolJson(zip, createMessageError);

      // Phase: Validating
      updateToastPhase(toastId, 'validating');
      const validationResult = await validateAndMigrateProtocol(protocolJson, {
        name: protocolName,
      });

      if (!validationResult.success) {
        const errorMessage = getValidationErrorMessage(validationResult);
        updateToastPhase(toastId, 'error', {
          error: errorMessage,
          onRetry: retryThisFile,
        });
        return;
      }

      const validatedProtocol = validationResult.protocol;

      // Phase: Checking duplicates
      updateToastPhase(toastId, 'checking-duplicates');
      const protocolHash = hashProtocol(validatedProtocol);
      const exists = await getProtocolByHash(protocolHash);
      if (exists) {
        updateToastPhase(toastId, 'error', {
          error: createMessageError(
            messages.protocolAlreadyExistsDeleteTheExistingProtocol,
          ),
          onRetry: retryThisFile,
        });
        return;
      }

      // Phase: Extracting assets
      updateToastPhase(toastId, 'extracting-assets');
      const { fileAssets, apikeyAssets } = await getProtocolAssets(
        validatedProtocol,
        zip,
        createMessageError,
      );

      const newAssets: typeof fileAssets = [];
      const existingAssetIds: string[] = [];
      let newAssetsWithCombinedMetadata: AssetInsertType[] = [];
      const newApikeyAssets: typeof apikeyAssets = [];

      try {
        const newFileAssetIds = await getNewAssetIds(
          fileAssets.map((asset) => asset.assetId),
        );

        fileAssets.forEach((asset) => {
          if (newFileAssetIds.includes(asset.assetId)) {
            newAssets.push(asset);
          } else {
            existingAssetIds.push(asset.assetId);
          }
        });

        const newApikeyAssetIds = await getNewAssetIds(
          apikeyAssets.map((apiKey) => apiKey.assetId),
        );

        apikeyAssets.forEach((apiKey) => {
          if (newApikeyAssetIds.includes(apiKey.assetId)) {
            newApikeyAssets.push(apiKey);
          } else {
            existingAssetIds.push(apiKey.assetId);
          }
        });
      } catch (_e) {
        throw new Error(createMessageError(messages.checkAssets), {
          cause: _e,
        });
      }

      // Phase: Uploading protocol
      updateToastPhase(toastId, 'uploading-protocol');

      const [uploadedOriginalFile] = await uploadAssets([file], (progress) => {
        updateToastPhase(toastId, 'uploading-protocol', {
          phaseProgress: progress,
        });
      });

      if (uploadedOriginalFile) {
        uploadedKeys.push(uploadedOriginalFile.key);
      }

      if (uploadedOriginalFile?.name !== file.name) {
        throw new Error(createMessageError(messages.protocolMismatch));
      }

      // Phase: Uploading assets
      updateToastPhase(toastId, 'uploading-assets');

      const uploadedAssetFiles = newAssets.length
        ? await uploadAssets(
            newAssets.map((asset) => asset.file),
            (progress) => {
              updateToastPhase(toastId, 'uploading-assets', {
                phaseProgress: progress,
              });
            },
          )
        : [];

      uploadedKeys.push(
        ...uploadedAssetFiles.map((uploadedFile) => uploadedFile.key),
      );

      newAssetsWithCombinedMetadata = newAssets.map((asset) => {
        const uploadedAsset = uploadedAssetFiles.find(
          (uploadedFile) => uploadedFile.name === asset.name,
        );

        if (!uploadedAsset) {
          throw new Error(createMessageError(messages.copyAssetUploadFailed));
        }

        return {
          key: uploadedAsset.key,
          assetId: asset.assetId,
          name: asset.name,
          type: asset.type,
          url: uploadedAsset.url,
          size: uploadedAsset.size,
        };
      });

      // Phase: Saving
      updateToastPhase(toastId, 'saving');
      const result = await insertProtocol({
        protocol: validatedProtocol,
        protocolName: fileName,
        newAssets: [...newAssetsWithCombinedMetadata, ...newApikeyAssets],
        existingAssetIds: existingAssetIds,
        originalFile: {
          key: uploadedOriginalFile.key,
          url: uploadedOriginalFile.url,
        },
      });

      if (result.error) {
        throw new DatabaseError(result.error, result.errorDetails);
      }

      captureClientEvent('ProtocolInstalled', {
        protocol: fileName,
      });

      // Phase: Complete
      updateToastPhase(toastId, 'complete', { displayName: protocolName });

      return;
    } catch (e) {
      const error = ensureError(e);
      const protocolFileError = describeProtocolFileErrorMessage(error);

      captureClientException(error);

      // Best-effort cleanup of any blobs uploaded before the failure, so a
      // failed import doesn't leave orphaned files in storage.
      if (uploadedKeys.length > 0) {
        void cleanupUploadedFiles(uploadedKeys);
      }

      updateToastPhase(toastId, 'error', {
        error:
          formatMessageError(error.message, createAppIntl({ locale: 'en' })) ===
          undefined
            ? protocolFileError
              ? createMessageError(
                  protocolFileError.descriptor,
                  protocolFileError.values,
                )
              : createMessageError(messages.operationalFailure)
            : error.message,
        onRetry: retryThisFile,
      });

      return;
    } finally {
      activeJobs.current.delete(fileName);
    }
  };

  const jobQueue = useRef(queue(processJob, 2));

  const importProtocols = useCallback((files: File[]) => {
    files.forEach((file) => {
      const sizeError = getProtocolSizeError(file, createMessageError);
      if (sizeError) {
        toastRef.current.add({
          id: generateJobId(),
          variant: 'destructive',
          title: file.name,
          description: <AppErrorMessage error={sizeError} />,
          timeout: 0,
        });
        return;
      }

      const jobAlreadyExists = activeJobs.current.has(file.name);

      if (jobAlreadyExists) {
        // eslint-disable-next-line no-console
        console.warn(`Skipping duplicate job: ${file.name}`);
        return;
      }

      activeJobs.current.add(file.name);

      const toastId = generateJobId();
      toastRef.current.add({
        id: toastId,
        title: file.name,
        description: <ImportToastContent phase="parsing" progress={0} />,
        icon: <Spinner size="xs" />,
        timeout: 0,
      });

      jobQueue.current.push({ file, toastId }).catch((error) => {
        // eslint-disable-next-line no-console
        console.log('jobQueue error', error);
      });
    });
  }, []);

  return {
    importProtocols,
  };
};
