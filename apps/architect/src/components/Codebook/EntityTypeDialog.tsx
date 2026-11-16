import { get } from 'es-toolkit/compat';
import { createElement, useCallback, useMemo, useState } from 'react';
import { useStore } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
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

  /**
   * Every open is a different editing session, so each one needs its own field
   * store — the `key` `DialogForm` documents for exactly this — and its own
   * resource edit.
   *
   * Identifying the session by what is being edited is not enough. `type` is
   * undefined for a creation, so `new-${entity}` was the SAME key for two
   * consecutive creations of the same entity — and this dialog is mounted for
   * the lifetime of its owner (`CodebookPage` keeps it rendered and only
   * toggles `show`), so nothing else separates them. What normally hides that
   * is `Modal`'s exit animation: it unmounts the form, whose `useForm` cleanup
   * resets the store. A close followed by another open before that exit
   * finishes cancels the removal, so the reset never runs — and the next
   * type's fields re-register over the previous one's parked values, which
   * `registerField` prefers over `initialValue`. Creating two edge types back
   * to back (the sample protocol's edge-creation sociogram does exactly that)
   * therefore reopened the dialog still holding the first type's name, colour
   * and shape, and saving it wrote those over the second type's own defaults.
   * Reopening the same type after abandoning an edit had the same effect.
   *
   * Counting opens rather than naming the session also covers that reopen
   * case, since `type` alone repeats there too. It is bumped as the dialog
   * OPENS (the React-documented adjust-state-on-prop-change pattern) rather
   * than on close, so the entering dialog is the fresh one and a close still
   * animates out.
   */
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
          adoptStagedResources={client.adoptStagedResources}
        />
      </ResourceClientProvider>
    </ProtocolBuilder>
  );
};

type EntityTypeFormProps = EntityTypeDialogProps &
  Readonly<{
    entity: 'node' | 'edge' | 'ego';
    adoptStagedResources: ArchitectClient['adoptStagedResources'];
  }>;

const EntityTypeForm = ({
  show,
  entity,
  type,
  onClose,
  finalFocus,
  adoptStagedResources,
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

  const title = useMemo(() => {
    const entityLabel =
      entity === 'node'
        ? intl.formatMessage(chromeMessages.node)
        : intl.formatMessage(chromeMessages.edge);
    return isNew
      ? intl.formatMessage(chromeMessages.createType, {
          entityLabel: entityLabel,
        })
      : intl.formatMessage(chromeMessages.editType, {
          entityLabel: entityLabel,
        });
  }, [entity, isNew, intl]);

  const handleSubmit = useCallback(
    async (values: Record<string, FieldValue>) => {
      // `updateType` replaces the whole definition, and `getFormValues()`
      // reports registered fields only — so the properties this editor does
      // not render (`variables` above all) are carried over from the committed
      // definition.
      const configuration = parse({ ...initialValues, ...values });

      // Architect has already written each imported image to the protocol's
      // assets; handing them over stops this edit's cancel from removing them.
      const keepImports = () => {
        const promotion = staged.promotion();
        if (promotion === undefined) return;
        if (adoptStagedResources(promotion)) {
          staged.promoted();
          return;
        }
        // Only reachable if a resource named by this edit was imported by
        // another; the type itself is saved either way.
        reportError(new Error('an imported resource belonged to another edit'));
      };

      try {
        if (isNew) {
          const result = await dispatch(
            createTypeAsync({
              entity,
              configuration,
            }),
          ).unwrap();
          keepImports();
          onClose(result.type);
        } else if (type) {
          await dispatch(
            updateTypeAsync({
              entity,
              type,
              configuration,
            }),
          ).unwrap();
          keepImports();
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
      adoptStagedResources,
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
