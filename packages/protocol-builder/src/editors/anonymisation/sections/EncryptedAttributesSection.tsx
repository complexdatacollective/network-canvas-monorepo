import { createElement, useMemo, useState } from 'react';

import {
  createMessageError,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import {
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { VariableTypes } from '@codaco/protocol-validation';

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
}>;

/**
 * One type's text attributes, under a heading naming the type.
 *
 * A component of its own rather than the map body it was, because the level
 * this heading takes is a fact about where it renders: the section around it
 * states what it encloses, and only something rendered INSIDE the section can
 * read that. Written from the section component itself the answer is the
 * heading above the section, which is one rung too high.
 */
function NodeTypeAttributes({
  view,
  disabled,
  onChange,
}: Readonly<{
  view: NodeTypeView;
  disabled: boolean;
  onChange: (next: readonly unknown[]) => void;
}>) {
  const intl = useAppIntl();
  const enclosingHeadingLevel = useEnclosingHeadingLevel();
  const headingTag =
    enclosingHeadingLevel === null
      ? 'h4'
      : headingTagBelow(enclosingHeadingLevel);

  return (
    <div>
      <Heading
        level="h4"
        margin="none"
        // The element only — `level` still carries the type treatment.
        {...(headingTag === 'h4' ? {} : { render: createElement(headingTag) })}
      >
        {view.name}
      </Heading>
      {view.options.length === 0 ? (
        <Paragraph margin="none" emphasis="muted">
          {intl.formatMessage(anonymisationMessages.noTextAttributes)}
        </Paragraph>
      ) : (
        <UnconnectedField<typeof CheckboxGroupField>
          name={`encrypted-attributes-${view.typeId}`}
          component={CheckboxGroupField}
          // Named for the type as well, and hidden: the heading above says
          // the type once for a reader who can see it, and a screen reader
          // meeting the group on its own has to be told which type's
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
    </div>
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

  const nodeTypes = useMemo<readonly NodeTypeView[]>(() => {
    const definitions = protocolContext.codebook.node ?? {};
    return Object.entries(definitions)
      .map(([typeId, definition]): NodeTypeView => {
        const variables = Object.entries(definition.variables ?? {}).filter(
          ([, variable]) => variable.type === TEXT,
        );
        return {
          typeId,
          name: definition.name,
          options: variables
            .map(([value, variable]) => ({ value, label: variable.name }))
            .toSorted((left, right) => left.label.localeCompare(right.label)),
          encrypted: variables
            .filter(([, variable]) => variable.encrypted === true)
            .map(([value]) => value),
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
