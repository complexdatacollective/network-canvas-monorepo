import { useMemo, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import {
  createMessageError,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { VariableTypes } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { codebookEditingMessages } from '../../../codebook/codebookMessages.ts';
import { documentWithUpdatedVariable } from '../../../codebook/editing.ts';
import { useCodebookSectionWrite } from '../../../codebook/writes.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../../protocol-context.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { anonymisationMessages } from './anonymisationMessages.ts';

/**
 * Encryption protects TEXT only.
 *
 * The interview encrypts string values; a number or a date flagged encrypted
 * would be written to the database in the clear, and the researcher would have
 * been told otherwise. So only text attributes are offered — and an attribute
 * that stops being text stops being offered, which is why this list is read
 * from the codebook every render rather than remembered.
 */
const TEXT = VariableTypes.text;

type NodeTypeView = Readonly<{
  typeId: string;
  name: string;
  options: readonly Readonly<{ value: string; label: string }>[];
  encrypted: readonly string[];
  /** Whether the type protects anything at all, which is what its switch says. */
  hasEncrypted: boolean;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Every attribute of one type carrying the flag, read from the AUTHORITATIVE
 * document rather than from the view the researcher clicked.
 *
 * The sweep is written against what the codebook holds at the moment the lock
 * is taken, so an attribute a collaborator encrypted while the confirmation
 * was on screen is cleared too — the researcher has just said no attribute of
 * this type should be encrypted, and leaving that one would contradict the
 * switch they are looking at.
 */
const encryptedVariableIds = (document: SectionDoc): readonly string[] => {
  const variables = document.variables;
  if (!isRecord(variables)) return [];
  return Object.entries(variables).flatMap(([id, variable]) =>
    isRecord(variable) && variable.encrypted === true ? [id] : [],
  );
};

/**
 * One type's text attributes, behind a switch of its own.
 *
 * A switch rather than a heading, because "no attribute of this type is
 * encrypted" is a decision a researcher makes about a whole type and would
 * otherwise be a study's worth of clicks, one box at a time. Switching it off
 * is what runs the sweep — see `EncryptedAttributesSection` — and switching it
 * on only opens the panel: choosing nothing yet is not a change to the
 * codebook.
 *
 * A plain `Section` rather than the package's `BuilderSection`, because
 * `encrypted` is a property of a CODEBOOK attribute and not a stage field:
 * there are no form values under this panel for a capability's own discard to
 * throw away, and the write it makes is immediate and outside the stage's
 * save.
 */
function NodeTypeAttributes({
  view,
  disabled,
  onChange,
  onRequestOpenChange,
}: Readonly<{
  view: NodeTypeView;
  disabled: boolean;
  onChange: (next: readonly unknown[]) => void;
  onRequestOpenChange: (open: boolean) => Promise<boolean>;
}>) {
  const intl = useAppIntl();

  return (
    <Section
      title={view.name}
      description={intl.formatMessage(
        anonymisationMessages.typeSwitchDescription,
      )}
      disabled={disabled}
      toggleable
      // Open on a type that already protects something, which is also the one
      // state where a stranded flag on a retyped attribute is visible: the
      // switch stands on, and switching it off is what takes the flag away.
      defaultOpen={view.hasEncrypted}
      onOpenChange={onRequestOpenChange}
    >
      {view.options.length === 0 ? (
        <Paragraph margin="none" emphasis="muted">
          {intl.formatMessage(anonymisationMessages.noTextAttributes)}
        </Paragraph>
      ) : (
        <UnconnectedField<typeof CheckboxGroupField>
          name={`encrypted-attributes-${view.typeId}`}
          component={CheckboxGroupField}
          // Named for the type as well, and hidden: the section's own heading
          // says the type once for a reader who can see it, and a screen
          // reader meeting the group on its own has to be told which type's
          // attributes these are.
          label={intl.formatMessage(anonymisationMessages.attributeGroupLabel, {
            typeName: view.name,
          })}
          labelHidden
          options={[...view.options]}
          value={[...view.encrypted]}
          disabled={disabled}
          onChange={(next) => onChange(next ?? [])}
        />
      )}
    </Section>
  );
}

/**
 * Which attributes the participant's passphrase protects.
 *
 * `encrypted` is a property of a CODEBOOK attribute, not of this stage: it
 * decides how the interview stores that attribute wherever it is collected,
 * and it outlives any stage that happens to switch it on. So a change here is
 * a codebook edit, taken under the codebook section's own lock and committed
 * at once — not part of this stage's save, and unaffected by cancelling it.
 * The section is composed into this editor because this is where a researcher
 * goes looking for it.
 *
 * Nothing here is mirrored locally. The list, the checkboxes and their state
 * are read from the authoritative codebook every render, so a type or an
 * attribute a collaborator changes — including one that stops being text —
 * is reflected here without this section issuing anything of its own.
 *
 * Each type is a switch of its own, and switching one off un-encrypts every
 * attribute of that type at once, as Architect's does: saying "this type is
 * not protected after all" is otherwise a study's worth of clicks, one box at
 * a time, each its own codebook write. The loss is real, so it is confirmed
 * first.
 */
export default function EncryptedAttributesSection() {
  const intl = useAppIntl();
  const { readOnly } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const writeCodebookSection = useCodebookSectionWrite();
  /**
   * What was announced last, encoded rather than formatted: an announcement
   * stays in its live region until another replaces it, so a sentence resolved
   * when the choice was made would be the one thing left in the old language
   * after the reader changes it.
   */
  const [announcement, setAnnouncement] = useState('');
  /**
   * Why the last change was refused, encoded for the same reason, and in which
   * register to say it: a section somebody else is holding is not a fault —
   * the change is fine and lands once they are finished — so it is a notice
   * rather than an error, exactly as every other codebook writer says it.
   */
  const [failure, setFailure] = useState<
    Readonly<{ message: string; held: boolean }> | undefined
  >(undefined);
  const [busy, setBusy] = useState(false);
  const { confirm } = useDialog();

  const nodeTypes = useMemo<readonly NodeTypeView[]>(() => {
    const definitions = protocolContext.codebook.node ?? {};
    return Object.entries(definitions)
      .map(([typeId, definition]): NodeTypeView => {
        const all = Object.entries(definition.variables ?? {});
        const variables = all.filter(([, variable]) => variable.type === TEXT);
        return {
          typeId,
          name: definition.name,
          options: variables
            .map(([value, variable]) => ({ value, label: variable.name }))
            .toSorted((left, right) => left.label.localeCompare(right.label)),
          encrypted: variables
            .filter(([, variable]) => variable.encrypted === true)
            .map(([value]) => value),
          hasEncrypted: all.some(([, variable]) => variable.encrypted === true),
        };
      })
      .toSorted((left, right) => left.name.localeCompare(right.name));
  }, [protocolContext]);

  const setEncrypted = async (
    view: NodeTypeView,
    variableId: string,
    encrypted: boolean,
  ) => {
    const subject: CodebookSubject = { entity: 'node', type: view.typeId };
    const label =
      view.options.find((option) => option.value === variableId)?.label ??
      variableId;

    setFailure(undefined);
    setBusy(true);
    try {
      const outcome = await writeCodebookSection(subject, (authoritative) =>
        documentWithUpdatedVariable({
          subject,
          authoritativeDocument: authoritative,
          variableId,
          // Switching encryption off REMOVES the property rather than storing
          // `false`: absence is how the protocol schema spells "not
          // encrypted", and a stored `false` would go on saying something
          // about an attribute nobody is protecting.
          draft: encrypted ? { encrypted: true } : {},
          replaceProperties: ['encrypted'],
        }),
      );
      if (outcome.status !== 'applied') {
        setFailure({
          message: outcome.message,
          held: outcome.refusal.kind === 'held',
        });
        return;
      }
      setAnnouncement(
        createMessageError(
          encrypted
            ? anonymisationMessages.encryptedAnnouncement
            : anonymisationMessages.notEncryptedAnnouncement,
          { attributeName: label },
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * Un-encrypts every attribute of one type, in ONE write.
   *
   * One write rather than one per attribute: the whole sweep is a single
   * decision, and a lock taken and released per attribute would let a
   * collaborator's own edit land in the middle of it — leaving a type half
   * protected, which is neither of the two states the switch can show.
   */
  const clearType = async (view: NodeTypeView): Promise<boolean> => {
    const subject: CodebookSubject = { entity: 'node', type: view.typeId };
    setFailure(undefined);
    setBusy(true);
    try {
      const outcome = await writeCodebookSection(subject, (authoritative) =>
        encryptedVariableIds(authoritative).reduce(
          (document, variableId) =>
            documentWithUpdatedVariable({
              subject,
              authoritativeDocument: document,
              variableId,
              draft: {},
              replaceProperties: ['encrypted'],
            }),
          authoritative,
        ),
      );
      if (outcome.status !== 'applied') {
        setFailure({
          message: outcome.message,
          held: outcome.refusal.kind === 'held',
        });
        return false;
      }
      setAnnouncement(
        createMessageError(anonymisationMessages.clearedTypeAnnouncement, {
          typeName: view.name,
        }),
      );
      return true;
    } finally {
      setBusy(false);
    }
  };

  /**
   * What one type's switch does.
   *
   * Switching ON only opens the panel: a type nobody has ticked anything for
   * has nothing to write. Switching OFF is the sweep, confirmed first because
   * it un-encrypts attributes the researcher may not be looking at — and
   * refused writes leave the switch where the researcher left it, over the
   * attributes that are still protected.
   */
  const requestOpenChange = async (
    view: NodeTypeView,
    open: boolean,
  ): Promise<boolean> => {
    if (open || !view.hasEncrypted) return true;
    const confirmed = await confirm({
      title: intl.formatMessage(anonymisationMessages.clearTypeConfirmTitle),
      description: intl.formatMessage(
        anonymisationMessages.clearTypeConfirmDescription,
        { typeName: view.name },
      ),
      confirmLabel: intl.formatMessage(
        anonymisationMessages.clearTypeConfirmLabel,
      ),
      cancelLabel: intl.formatMessage(commonMessages.cancel),
      intent: 'warning',
      onConfirm: () => undefined,
    });
    if (confirmed !== true) return false;
    return clearType(view);
  };

  const handleChange = (view: NodeTypeView, next: readonly unknown[]) => {
    const chosen = new Set(
      next.filter((value): value is string => typeof value === 'string'),
    );
    const current = new Set(view.encrypted);
    for (const { value } of view.options) {
      if (chosen.has(value) === current.has(value)) continue;
      void setEncrypted(view, value, chosen.has(value));
    }
  };

  return (
    <BuilderSection
      title={intl.formatMessage(anonymisationMessages.encryptedAttributesTitle)}
      description={intl.formatMessage(
        anonymisationMessages.encryptedAttributesDescription,
      )}
    >
      <Alert variant="info" density="compact">
        <AlertDescription>
          {intl.formatMessage(anonymisationMessages.storageNotice)}
        </AlertDescription>
      </Alert>

      {failure !== undefined && (
        <Alert
          variant={failure.held ? 'warning' : 'destructive'}
          density="compact"
        >
          <AlertDescription>
            {formatMessageError(failure.message, intl) ?? failure.message}
          </AlertDescription>
        </Alert>
      )}

      {nodeTypes.length === 0 && (
        <Paragraph margin="none" emphasis="muted">
          {intl.formatMessage(anonymisationMessages.noTypesEmptyState)}
        </Paragraph>
      )}

      {nodeTypes.map((view) => (
        <NodeTypeAttributes
          key={view.typeId}
          view={view}
          disabled={readOnly || busy}
          onChange={(next) => handleChange(view, next)}
          onRequestOpenChange={(open) => requestOpenChange(view, open)}
        />
      ))}

      {/* Every checkbox above is disabled while a codebook write is in flight,
          so a tick made in that window reaches nothing. Saying the section is
          saving is what keeps that from being silent: without it a researcher
          ticks a second attribute, watches the box refuse to move, and is told
          neither why nor that a change is already on its way. A live region
          rather than an `aria-busy` one: `aria-busy` tells a screen reader to
          hold an announcement back until it clears, and this sentence is only
          ever on screen while it would not. */}
      {busy && (
        <Paragraph role="status" margin="none" emphasis="muted">
          {intl.formatMessage(codebookEditingMessages.saving)}
        </Paragraph>
      )}

      {/* Mounted with the section rather than with the message, so the first
          announcement updates a region that was already there. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {formatMessageError(announcement, intl) ?? announcement}
      </span>
    </BuilderSection>
  );
}
