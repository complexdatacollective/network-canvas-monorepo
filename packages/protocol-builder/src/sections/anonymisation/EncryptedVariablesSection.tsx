import { createElement, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';

import {
  createMessageError,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import {
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { VariableTypes } from '@codaco/protocol-validation';

import {
  buildUpdateVariableRequest,
  sectionIdForCodebookSubject,
} from '../../codebook/editing.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import BuilderSection from '../BuilderSection.tsx';
import { anonymisationMessages } from './anonymisationMessages.ts';

/**
 * Encryption protects TEXT only.
 *
 * The interview encrypts string values; a number or a date flagged encrypted
 * would be written to the database in the clear, and the researcher would have
 * been told otherwise. So only text attributes are offered — and an attribute
 * that stops being text stops being offered, which is why this list is read
 * from the codebook every time rather than remembered.
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
    <div className="flex flex-col gap-2">
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
        <CheckboxGroupField
          name={`encrypted-attributes-${view.typeId}`}
          aria-label={intl.formatMessage(
            anonymisationMessages.attributeGroupLabel,
            { typeName: view.name },
          )}
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
 * What is wrong, encoded rather than formatted.
 *
 * The result stands in `failure` state from this submission until the next,
 * which is longer than the language it was produced in is guaranteed to
 * last — decoding it here would freeze it in whatever locale was active when
 * the host answered. A refusal the host wrote arrives as a bare `message`,
 * which is a string-only contract already carrying either a plain sentence or
 * a descriptor `createMessageError` encoded on the other side of it; either
 * way it is passed through untouched; the render site decodes both this and
 * the `typeHeldRefusal` case the same way.
 */
const editFailureMessage = (
  result:
    | Readonly<{ status: 'blocked'; blockedSections: readonly unknown[] }>
    | Readonly<{ status: 'failed'; message: string }>,
): string => {
  if (result.status === 'failed') {
    return result.message;
  }
  return createMessageError(anonymisationMessages.typeHeldRefusal);
};

/**
 * Which attributes the participant's passphrase protects.
 *
 * `encrypted` is a property of a CODEBOOK attribute, not of this stage: it
 * decides how the interview stores that attribute wherever it is collected,
 * and it outlives any stage that happens to switch it on. So a change here is
 * a codebook edit — one compound edit per attribute, through the same path the
 * codebook screen uses, which is what makes it atomic and what lets a host
 * refuse it when a collaborator holds that type.
 *
 * Nothing here is mirrored locally. The list, the checkboxes, and their state
 * are read from the authoritative codebook every render, so a type or an
 * attribute a collaborator changes — including one that stops being text, and
 * whose `encrypted` flag the codebook editor clears with it — is reflected
 * here without this section issuing anything of its own.
 */
export default function EncryptedVariablesSection() {
  const intl = useAppIntl();
  const { controller, readOnly } = useStageEditorForm();
  /**
   * What was announced last, encoded for the same reason `failure` below is:
   * an announcement stays in its live region until another replaces it, so a
   * sentence formatted when the choice was made would be the one thing left
   * in the old language after the application changes its own.
   */
  const [status, setStatus] = useState('');
  /**
   * Why the last edit was refused, encoded rather than formatted — it stands
   * from this submission until the next, and the render site decodes it with
   * whichever formatter is current then.
   */
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const snapshot = controller.snapshot;
  const nodeTypes = useMemo<readonly NodeTypeView[]>(() => {
    const definitions = snapshot.protocolContext.codebook.node ?? {};
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
  }, [snapshot.protocolContext]);

  const setEncrypted = async (
    view: NodeTypeView,
    variableId: string,
    encrypted: boolean,
  ) => {
    const subject: CodebookSubject = { entity: 'node', type: view.typeId };
    const authoritativeDocument =
      snapshot.protocolSections[sectionIdForCodebookSubject(subject)];
    const label =
      view.options.find((option) => option.value === variableId)?.label ??
      variableId;
    if (authoritativeDocument === undefined) {
      setFailure(
        createMessageError(anonymisationMessages.typeUnavailableRefusal),
      );
      return;
    }

    setFailure(undefined);
    setBusy(true);
    try {
      const request = buildUpdateVariableRequest({
        requestId: uuid(),
        description: intl.formatMessage(
          encrypted
            ? anonymisationMessages.encryptEditDescription
            : anonymisationMessages.stopEncryptingEditDescription,
          { attributeName: label, typeName: view.name },
        ),
        subject,
        authoritativeDocument,
        variableId,
        // One compound edit either way. Switching encryption off REMOVES the
        // property rather than storing `false`: absence is how the protocol
        // schema spells "not encrypted", and a stored `false` would keep
        // saying something about an attribute nobody is protecting.
        draft: encrypted ? { encrypted: true } : {},
        replaceProperties: ['encrypted'],
      });
      const result = await controller.requestCompoundEdit(request);
      if (result.status !== 'applied') {
        setFailure(editFailureMessage(result));
        return;
      }
      setStatus(
        createMessageError(
          encrypted
            ? anonymisationMessages.encryptedAnnouncement
            : anonymisationMessages.notEncryptedAnnouncement,
          { attributeName: label },
        ),
      );
    } catch {
      setFailure(createMessageError(anonymisationMessages.editFailedRefusal));
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
        <Alert variant="destructive" density="compact">
          <AlertDescription>
            {formatMessageError(failure, intl) ?? failure}
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

      {/* Mounted with the section rather than with the message, so the first
          announcement updates a region that was already there. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {formatMessageError(status, intl) ?? status}
      </span>
    </BuilderSection>
  );
}
