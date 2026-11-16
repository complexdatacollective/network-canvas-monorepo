import { get } from 'es-toolkit/compat';
import { createElement, useCallback, useMemo, useState } from 'react';
import { useStore } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import { ProtocolBuilder } from '@codaco/protocol-builder/ProtocolBuilder';
import {
  ResourceClientProvider,
  useStagedResources,
} from '@codaco/protocol-builder/resources/client';
import DialogForm, {
  type DialogFormProps,
} from '~/components/DialogForm/DialogForm';
import { format, parse } from '~/components/TypeEditor/convert';
import getNewTypeTemplate from '~/components/TypeEditor/getNewTypeTemplate';
import TypeEditor, {
  type EntityTypeValues,
} from '~/components/TypeEditor/TypeEditor';
import validateEntityType from '~/components/TypeEditor/validateEntityType';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { getActiveProtocolId } from '~/ducks/modules/app';
import {
  createTypeAsync,
  updateTypeAsync,
} from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/store';
import type { ArchitectClient } from '~/protocolBuilder/client';
import { useArchitectClient } from '~/protocolBuilder/useArchitectClient';
import { useOtherTabName } from '~/protocolBuilder/useOtherTabName';
import { getProtocol } from '~/selectors/protocol';
import { reportError } from '~/utils/reportError';

import { adoptStagedImages } from './adoptStagedImages';

const chromeMessages = defineMessages({
  node: {
    id: 'architect.chrome.codebook.entityTypeDialog.node',
    defaultMessage: 'Node',
    description:
      'The word Node, inserted as entityLabel into the title of the dialog for creating or editing a node type (a kind of person or thing participants name).',
  },
  edge: {
    id: 'architect.chrome.codebook.entityTypeDialog.edge',
    defaultMessage: 'Edge',
    description:
      'The word Edge, inserted as entityLabel into the title of the dialog for creating or editing an edge type (a kind of relationship between nodes).',
  },
  createType: {
    id: 'architect.chrome.codebook.entityTypeDialog.createType',
    defaultMessage: 'Create {entityLabel} Type',
    description:
      'Title of the dialog for creating a new node type or edge type. entityLabel is the word Node or Edge.',
  },
  editType: {
    id: 'architect.chrome.codebook.entityTypeDialog.editType',
    defaultMessage: 'Edit {entityLabel} Type',
    description:
      'Title of the dialog for editing an existing node type or edge type. entityLabel is the word Node or Edge.',
  },
});
const messages = defineMessages({
  couldNotCreateType: {
    id: 'architect.codebook.entityTypeDialog.couldNotCreateType',
    defaultMessage: 'Could not create type',
    description:
      'Title of the error dialog shown when saving a new node type or edge type fails.',
  },
  couldNotUpdateType: {
    id: 'architect.codebook.entityTypeDialog.couldNotUpdateType',
    defaultMessage: 'Could not update type',
    description:
      'Title of the error dialog shown when saving changes to an existing node type or edge type fails.',
  },
  oK: {
    id: 'architect.codebook.entityTypeDialog.oK',
    defaultMessage: 'OK',
    description: 'Button that dismisses the could-not-save-type error dialog.',
  },
  saveAndClose: {
    id: 'architect.codebook.entityTypeDialog.saveAndClose',
    defaultMessage: 'Save and Close',
    description:
      'Submit button of the node type or edge type dialog that saves the type and closes the dialog.',
  },
});

const FORM_ID = 'entity-type-dialog';

type EntityTypeDialogProps = {
  show: boolean;
  entity?: 'node' | 'edge' | 'ego';
  type?: string;
  onClose: (newTypeId?: string) => void;
  finalFocus?: DialogFormProps['finalFocus'];
};

/**
 * The node or edge type editor, inside a protocol builder so its custom shape
 * field can import SVG images as protocol resources.
 *
 * Each opening is an edit of its own for those imports: a save hands them to
 * the protocol, and Cancel takes them back.
 */
const EntityTypeDialog = (props: EntityTypeDialogProps) => {
  const { show, entity, type } = props;
  const store = useStore<RootState>();
  const client = useArchitectClient(store, useOtherTabName());
  const protocolId = useAppSelector(getActiveProtocolId);

  // Every opening needs a fresh field store and resource edit, even when
  // `entity`/`type` repeat (two creations, or a reopen before the exit
  // animation unmounts the form), so openings are counted as the dialog opens.
  const [wasShown, setWasShown] = useState(show);
  const [openCount, setOpenCount] = useState(0);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setOpenCount((count) => count + 1);
    }
  }

  if (!entity || protocolId === null) {
    return null;
  }

  // `entity`/`type` stay in the key so switching what is being edited without
  // closing still remounts.
  const sessionKey = `${entity}-${type ?? 'new'}-${openCount}`;

  return (
    <ProtocolBuilder adapter={client.adapter} protocolId={protocolId}>
      <ResourceClientProvider key={sessionKey}>
        <EntityTypeForm
          {...props}
          entity={entity}
          planStagedResourceAdoption={client.planStagedResourceAdoption}
        />
      </ResourceClientProvider>
    </ProtocolBuilder>
  );
};

type EntityTypeFormProps = EntityTypeDialogProps &
  Readonly<{
    entity: 'node' | 'edge' | 'ego';
    planStagedResourceAdoption: ArchitectClient['planStagedResourceAdoption'];
  }>;

const EntityTypeForm = ({
  show,
  entity,
  type,
  onClose,
  finalFocus,
  planStagedResourceAdoption,
}: EntityTypeFormProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const staged = useStagedResources();
  const { openDialog } = useDialog();
  const protocol = useAppSelector((state: RootState) => getProtocol(state));

  const isNew = !type;

  const initialValues = useMemo<EntityTypeValues>(() => {
    if (!protocol) {
      return {};
    }
    const defaultValue = getNewTypeTemplate({
      protocol,
      entity,
    });
    const value = type
      ? get(protocol, ['codebook', entity, type]) || defaultValue
      : defaultValue;
    return format(value) as EntityTypeValues;
  }, [protocol, entity, type]);

  const entityLabel = intl.formatMessage(
    entity === 'node' ? chromeMessages.node : chromeMessages.edge,
  );
  const title = intl.formatMessage(
    isNew ? chromeMessages.createType : chromeMessages.editType,
    { entityLabel },
  );

  const handleSubmit = useCallback(
    async (
      values: Record<string, FieldValue>,
    ): Promise<FormSubmissionResult> => {
      // `updateType` replaces the whole definition, and `getFormValues()`
      // reports registered fields only — so the properties this editor does
      // not render (`variables` above all) are carried over from the committed
      // definition.
      const configuration = parse({ ...initialValues, ...values });

      const adoption = adoptStagedImages(
        staged,
        planStagedResourceAdoption,
        values,
      );
      if (adoption.status === 'failed') {
        return { success: false, fieldErrors: adoption.fieldErrors };
      }

      try {
        if (isNew) {
          const result = await dispatch(
            createTypeAsync({
              entity,
              configuration,
            }),
          ).unwrap();
          adoption.keep();
          onClose(result.type);
        } else if (type) {
          await dispatch(
            updateTypeAsync({
              entity,
              type,
              configuration,
            }),
          ).unwrap();
          adoption.keep();
          onClose();
        }
      } catch (error) {
        // Keep the dialog open so the user can retry, and tell them the save
        // failed rather than leaving the submit looking like a no-op.
        const normalizedError = reportError(error);
        void openDialog({
          type: 'acknowledge',
          intent: 'destructive',
          title: isNew
            ? createElement(AppMessage, {
                message: messages.couldNotCreateType,
              })
            : createElement(AppMessage, {
                message: messages.couldNotUpdateType,
              }),
          description: normalizedError.message,
          actions: {
            primary: {
              label: createElement(AppMessage, { message: messages.oK }),
              value: true,
            },
          },
        });
      }
      return { success: true };
    },
    [
      dispatch,
      initialValues,
      onClose,
      entity,
      type,
      isNew,
      openDialog,
      staged,
      planStagedResourceAdoption,
    ],
  );

  return (
    <DialogForm
      open={show}
      onClose={() => {
        void staged.discardAll();
        onClose();
      }}
      title={title}
      formId={FORM_ID}
      submitLabel={intl.formatMessage(messages.saveAndClose)}
      onSubmit={handleSubmit}
      validate={validateEntityType}
      finalFocus={finalFocus}
    >
      <TypeEditor
        entity={entity}
        type={type}
        isNew={isNew}
        initialValues={initialValues}
      />
    </DialogForm>
  );
};

export default EntityTypeDialog;
