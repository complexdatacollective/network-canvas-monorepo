import { useMemo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';
import type { DialogSession } from '@codaco/fresco-ui/dialogs/useDialogSession';
import {
  EdgeColorSequence,
  NodeColorSequence,
} from '@codaco/protocol-validation';
import { parseSectionId } from '@codaco/studio-sync/taxonomy';

import type { RuleEntityTarget } from '../../rules/ruleCodebook.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import {
  type CodebookEntityDraft,
  documentWithEntityProperties,
} from '../editing.ts';
import { useCodebookSectionDocument } from '../useCodebookVariableEdits.ts';
import { useCodebookSectionWrite, useCreateCodebookEntity } from '../writes.ts';
import CodebookEntityEditor from './CodebookEntityEditor.tsx';

/**
 * What making a type is called, written out per entity kind because "the node
 * type" and "the edge type" do not differ only in the noun in every language.
 *
 * Also the title of the dialog it opens: what the researcher pressed is what
 * the thing they are now looking at is called.
 */
export const createEntityLabels = defineMessages({
  node: {
    id: 'protocolBuilder.entitySelect.nodeCreateLabel',
    defaultMessage: 'Create new node type',
    description:
      'Button that opens an editor for inventing a kind of network member. Also the title of the dialog it opens. A node type is a kind of network member the study records, such as a person or a place.',
  },
  edge: {
    id: 'protocolBuilder.entitySelect.edgeCreateLabel',
    defaultMessage: 'Create new edge type',
    description:
      'Button that opens an editor for inventing a kind of relationship. Also the title of the dialog it opens. An edge type is a kind of relationship between two network members, such as a friendship.',
  },
}) satisfies Record<RuleEntityTarget, MessageDescriptor>;

/**
 * What changing a type's own definition is called.
 *
 * "This" rather than the type's name: the button is beside what shows which
 * one it is, and a name dropped into a frame is a sentence no translator saw
 * whole.
 */
export const editEntityLabels = defineMessages({
  node: {
    id: 'protocolBuilder.entitySelect.nodeEditLabel',
    defaultMessage: 'Edit this node type',
    description:
      'Button that opens an editor for an existing kind of network member, so its name, colour, shape or icon can be changed. Also the title of the dialog it opens.',
  },
  edge: {
    id: 'protocolBuilder.entitySelect.edgeEditLabel',
    defaultMessage: 'Edit this edge type',
    description:
      'Button that opens an editor for an existing kind of relationship, so its name or colour can be changed. Also the title of the dialog it opens.',
  },
}) satisfies Record<RuleEntityTarget, MessageDescriptor>;

/**
 * The draft a new type opens with.
 *
 * Seeded with the next colour of the palette, so a second type does not open
 * in the first one's colour, and a node with the shape and icon every
 * interface has always drawn one with.
 */
export function newEntityDraft(
  entity: RuleEntityTarget,
  existingTypes: number,
): CodebookEntityDraft {
  if (entity === 'edge') {
    const palette = EdgeColorSequence;
    return {
      name: '',
      color: palette[existingTypes % palette.length] ?? palette[0],
    };
  }
  const palette = NodeColorSequence;
  return {
    name: '',
    color: palette[existingTypes % palette.length] ?? palette[0],
    shape: { default: 'circle' },
    icon: 'add-a-person',
  };
}

/**
 * One opening of the entity editor.
 *
 * The key is what resets the editor's draft, and it is minted per opening
 * rather than per type: reopening the same type after backing out of it is a
 * new question, and an editor that kept the abandoned draft would answer the
 * old one. For a create, `typeId` is an id reserved so the editor has a
 * subject to be about; the id the type ends up with is the host's, read off
 * the write.
 */
export type CodebookEntityEditorSession = Readonly<{
  key: string;
  entity: RuleEntityTarget;
  typeId: string;
  mode: 'create' | 'edit';
}>;

export type CodebookEntityEditorDialogProps = Readonly<{
  session: DialogSession<CodebookEntityEditorSession>;
  /** Closes the dialog: turns the session's `open` off. */
  onClose(): void;
  /** Called once the dialog has finished animating out. */
  onExitComplete(): void;
  finalFocus?: DialogProps['finalFocus'];
  readOnly?: boolean;
  /**
   * Told the id the host gave a created type, while the dialog is still open.
   * The dialog closes once this settles.
   */
  onCreated?(typeId: string): void | Promise<void>;
}>;

/**
 * The codebook's entity editor in its own dialog, writing through the host.
 *
 * A closed session is still rendered until `onExitComplete`: the exit
 * animation belongs to the dialog, and unmounting it on close takes the
 * animation away with it.
 */
export default function CodebookEntityEditorDialog(
  props: CodebookEntityEditorDialogProps,
) {
  return <EntityEditorDialog key={props.session.key} {...props} />;
}

function EntityEditorDialog({
  session,
  onClose,
  onExitComplete,
  finalFocus,
  readOnly = false,
  onCreated,
}: CodebookEntityEditorDialogProps) {
  const intl = useAppIntl();
  const codebook = useProtocolContext().codebook;
  const createEntity = useCreateCodebookEntity();
  const writeSection = useCodebookSectionWrite();
  const { entity, typeId, mode } = session;
  const subject = useMemo(
    () => ({ entity, type: typeId }) as const,
    [entity, typeId],
  );

  const liveDocument = useCodebookSectionDocument(
    mode === 'edit' ? subject : undefined,
  );
  /*
    The section the edit opened against, kept for the case where it goes. A
    collaborator deleting the type takes the document away under a researcher
    who is mid-edit; what they have on screen is still their own work, so it
    stays, and the save is refused for the reason it is actually refused.
  */
  const [openedDocument] = useState(liveDocument);
  const editedDocument = liveDocument ?? openedDocument;

  /*
    Every type name the protocol already carries, of BOTH kinds, minus the one
    being edited. Node and edge types share one namespace, so a type judged
    against its own kind alone could be given the other kind's name. Excluded
    by kind and id together, because nothing keeps the two maps' ids apart.
  */
  const existingEntityNames = useMemo(
    () =>
      [
        ...Object.entries(codebook.node ?? {}).map(
          ([id, definition]) => ['node', id, definition.name] as const,
        ),
        ...Object.entries(codebook.edge ?? {}).map(
          ([id, definition]) => ['edge', id, definition.name] as const,
        ),
      ].flatMap(([kind, id, name]) =>
        mode === 'edit' && kind === entity && id === typeId ? [] : [name],
      ),
    [codebook, entity, mode, typeId],
  );

  const dialog = {
    title: intl.formatMessage(
      mode === 'create' ? createEntityLabels[entity] : editEntityLabels[entity],
    ),
    open: session.open,
    onExitComplete,
    ...(finalFocus === undefined ? {} : { finalFocus }),
  };

  if (mode === 'create') {
    return (
      <CodebookEntityEditor
        mode="create"
        sessionKey={session.key}
        dialog={dialog}
        subject={subject}
        initialDraft={newEntityDraft(
          entity,
          Object.keys(codebook[entity] ?? {}).length,
        )}
        readOnly={readOnly}
        existingEntityNames={existingEntityNames}
        onSubmit={(document, promote) =>
          createEntity(entity, document, promote)
        }
        onApplied={(outcome) => {
          // The id the HOST minted, read off the write: it is the host's to
          // issue, and a caller has to name the type that was created.
          const ref = parseSectionId(outcome.sectionId);
          if (
            onCreated === undefined ||
            (ref.kind !== 'codebookNode' && ref.kind !== 'codebookEdge')
          ) {
            onClose();
            return;
          }
          // Told while this dialog is still open, and it closes on either
          // answer: a question the caller raises returns focus to the save
          // it was raised from, and this dialog then returns it to its own
          // trigger.
          void Promise.resolve(onCreated(ref.typeId)).finally(onClose);
        }}
        onCancel={onClose}
      />
    );
  }

  if (editedDocument === undefined) return null;

  return (
    <CodebookEntityEditor
      mode="update"
      sessionKey={session.key}
      dialog={dialog}
      subject={subject}
      initialDraft={editedDocument}
      authoritativeDocument={editedDocument}
      readOnly={readOnly}
      existingEntityNames={existingEntityNames}
      onSubmit={(document, promote) =>
        // Laid over the document the LOCK hands back, not over the one the
        // editor read: `variables` is the half of a type this form does not
        // own, and writing the form's copy of it whole would delete an
        // attribute a collaborator added while this save was taking the lock.
        writeSection(
          subject,
          (authoritativeDocument) =>
            documentWithEntityProperties({
              subject,
              authoritativeDocument,
              draft: document,
              // A type left with no custom shapes is saved without the key,
              // which would otherwise keep the stored ones.
              ...(Object.hasOwn(document, 'customShapes')
                ? {}
                : { unsetProperties: ['customShapes'] }),
            }),
          promote,
        )
      }
      onApplied={onClose}
      onCancel={onClose}
    />
  );
}
