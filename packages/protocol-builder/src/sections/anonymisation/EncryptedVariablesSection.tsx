import { createElement, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';

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

export type EncryptedVariablesCopy = Readonly<{
  sectionTitle: string;
  description: string;
  storageNotice: string;
  emptyMessage: string;
  noTextAttributes: string;
}>;

const DEFAULT_COPY: EncryptedVariablesCopy = {
  sectionTitle: 'Encrypted attributes',
  description:
    'Choose which text attributes are protected by the participant’s passphrase.',
  storageNotice:
    'An encrypted attribute is stored so that only the passphrase can unlock it. It cannot be read, exported, or recovered without it.',
  emptyMessage:
    'This protocol has no types yet, so there is nothing to encrypt. Add one in the codebook.',
  noTextAttributes:
    'This type has no text attributes, so it has nothing that can be encrypted.',
};

export type EncryptedVariablesSectionProps = Readonly<{
  copy?: Partial<EncryptedVariablesCopy>;
}>;

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
  noTextAttributes,
  disabled,
  onChange,
}: Readonly<{
  view: NodeTypeView;
  noTextAttributes: string;
  disabled: boolean;
  onChange: (next: readonly unknown[]) => void;
}>) {
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
          {noTextAttributes}
        </Paragraph>
      ) : (
        <CheckboxGroupField
          name={`encrypted-attributes-${view.typeId}`}
          aria-label={`Encrypted attributes for ${view.name}`}
          options={[...view.options]}
          value={[...view.encrypted]}
          disabled={disabled}
          onChange={(next) => onChange(next ?? [])}
        />
      )}
    </div>
  );
}

const editFailureMessage = (
  result:
    | Readonly<{ status: 'blocked'; blockedSections: readonly unknown[] }>
    | Readonly<{ status: 'failed'; message: string }>,
): string => {
  if (result.status === 'failed') return result.message;
  return 'Someone else is editing this type right now, so the change was not made. Try again in a moment.';
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
export default function EncryptedVariablesSection({
  copy,
}: EncryptedVariablesSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const { controller, readOnly } = useStageEditorForm();
  const [status, setStatus] = useState('');
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
        'That type is not available right now, so the change was not made.',
      );
      return;
    }

    setFailure(undefined);
    setBusy(true);
    try {
      const request = buildUpdateVariableRequest({
        requestId: uuid(),
        description: encrypted
          ? `Encrypt ${label} on ${view.name}`
          : `Stop encrypting ${label} on ${view.name}`,
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
        encrypted
          ? `${label} is now encrypted.`
          : `${label} is no longer encrypted.`,
      );
    } catch {
      setFailure(
        'That change could not be made. Check the attribute in the codebook and try again.',
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
    <BuilderSection title={words.sectionTitle} description={words.description}>
      <Alert variant="info" density="compact">
        <AlertDescription>{words.storageNotice}</AlertDescription>
      </Alert>

      {failure !== undefined && (
        <Alert variant="destructive" density="compact">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}

      {nodeTypes.length === 0 && (
        <Paragraph margin="none" emphasis="muted">
          {words.emptyMessage}
        </Paragraph>
      )}

      {nodeTypes.map((view) => (
        <NodeTypeAttributes
          key={view.typeId}
          view={view}
          noTextAttributes={words.noTextAttributes}
          disabled={readOnly || busy}
          onChange={(next) => handleChange(view, next)}
        />
      ))}

      {/* Mounted with the section rather than with the message, so the first
          announcement updates a region that was already there. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {status}
      </span>
    </BuilderSection>
  );
}
