import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import {
  EnclosingHeadingLevel,
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { canonicalize, type SectionDoc } from '@codaco/studio-sync/apply';

import type { CodebookSubject } from '../../protocol-context.ts';
import {
  codebookEditingMessages,
  missingComparisonTargetMessage,
} from '../codebookMessages.ts';
import { codebookRefusalMessage } from '../compoundFailureCopy.ts';
import { documentWithUpdatedVariable } from '../editing.ts';
import {
  isValidationWithListValue,
  ruleMapIssue,
  type ValidationMap,
  type ValidationValue,
} from '../variableValidation.ts';
import type { CodebookWriteOutcome } from '../writes.ts';
import VariableValidationEditor from './VariableValidationEditor.tsx';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.variableValidation.title',
    defaultMessage: 'Edit validation for {name}',
    description:
      'Heading of the surface where a researcher sets the rules an answer to one attribute must satisfy. name is the researcher’s own name for that attribute.',
  },
  description: {
    id: 'protocolBuilder.variableValidation.description',
    defaultMessage:
      'Configure requirements, limits, and comparisons for this attribute.',
    description:
      'Sentence under the heading naming the three groups of validation rules the surface offers. "Attribute" is a codebook variable.',
  },
  typeChangedTitle: {
    id: 'protocolBuilder.variableValidation.typeChangedTitle',
    defaultMessage: 'Attribute type changed',
    description:
      'Heading of the warning shown when someone else changed what kind of answer this attribute records while its validation was being edited.',
  },
  typeChangedIssue: {
    id: 'protocolBuilder.variableValidation.typeChangedIssue',
    defaultMessage:
      'The attribute type changed while this validation draft was open.',
    description:
      'Why the validation rules in front of the researcher cannot be saved: the kind of answer the attribute records was changed elsewhere, and these rules were written for the old one.',
  },
  typeChangedDescription: {
    id: 'protocolBuilder.variableValidation.typeChangedDescription',
    defaultMessage:
      'The attribute type changed while this validation draft was open. Your draft is still visible, but it cannot be saved. Close and reopen this editor to configure validation for the new attribute type.',
    description:
      'The same refusal as typeChangedIssue, said at length in the warning above the rules, with what to do about it.',
  },
  failureTitle: {
    id: 'protocolBuilder.variableValidation.failureTitle',
    defaultMessage: 'Could not save validation',
    description:
      'Heading of the alert shown when saving an attribute’s validation rules was refused. The reason follows underneath.',
  },
  attributeMissingIssue: {
    id: 'protocolBuilder.variableValidation.attributeMissingIssue',
    defaultMessage: 'The attribute no longer exists in this entity.',
    description:
      'Why the validation rules in front of the researcher cannot be saved: the attribute they belong to has been deleted from the codebook.',
  },
  attributeUnavailableTitle: {
    id: 'protocolBuilder.variableValidation.attributeUnavailableTitle',
    defaultMessage: 'Attribute unavailable',
    description:
      'Heading of the alert shown in place of the rules when the attribute they belong to has been deleted from the codebook.',
  },
  attributeUnavailableDescription: {
    id: 'protocolBuilder.variableValidation.attributeUnavailableDescription',
    defaultMessage: 'The latest entity data no longer contains this attribute.',
    description:
      'Shown in place of the validation rules when the attribute they belong to has been deleted from the codebook.',
  },
  submit: {
    id: 'protocolBuilder.variableValidation.submit',
    defaultMessage: 'Save validation',
    description:
      'Button that saves the rules an answer to this attribute must satisfy.',
  },
});

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isValidationValue = (value: unknown): value is ValidationValue =>
  value === null ||
  typeof value === 'boolean' ||
  typeof value === 'number' ||
  typeof value === 'string';

const variableFromDocument = (
  document: Readonly<SectionDoc>,
  variableId: string,
): UnknownRecord | undefined => {
  if (!isRecord(document.variables)) return undefined;
  const variable = document.variables[variableId];
  return isRecord(variable) ? variable : undefined;
};

const validationFromVariable = (
  variable: Readonly<UnknownRecord>,
): ValidationMap => {
  if (!isRecord(variable.validation)) return {};
  const entries: [string, ValidationValue][] = [];
  for (const [ruleKey, value] of Object.entries(variable.validation)) {
    if (isValidationValue(value)) entries.push([ruleKey, value]);
  }
  return Object.fromEntries(entries);
};

const missingTargetIssue = (
  validation: Readonly<ValidationMap>,
  allVariables: Readonly<UnknownRecord>,
  intl: IntlShape,
): string | undefined =>
  Object.entries(validation).some(
    ([ruleKey, target]) =>
      isValidationWithListValue(ruleKey) &&
      typeof target === 'string' &&
      !Object.hasOwn(allVariables, target),
  )
    ? intl.formatMessage(missingComparisonTargetMessage)
    : undefined;

export type CodebookVariableValidationEditorProps = Readonly<{
  /** Must change every time the surface opens, even for the same variable. */
  openId: string;
  subject: CodebookSubject;
  variableId: string;
  authoritativeEntityDocument: Readonly<SectionDoc>;
  allSubjectVariables: Readonly<UnknownRecord>;
  readOnly?: boolean;
  /**
   * Writes the section, and answers with what became of it.
   *
   * A refusal already written for the researcher — one naming the rule and the
   * values that cannot both hold — is shown as it arrived rather than replaced
   * by this package's copy for a save that did not happen.
   *
   * `ownedProperties` names what this submit set — the rules and nothing else —
   * for a caller that lays the result back over the section as the host holds
   * it (`documentWithRebasedVariable`). The rest of the attribute is written
   * from other surfaces, and a collaborator may be on one of them right now.
   */
  onSubmitDocument(
    document: SectionDoc,
    ownedProperties?: readonly string[],
  ): Promise<CodebookWriteOutcome>;
  onComplete?(
    outcome: Extract<CodebookWriteOutcome, { status: 'applied' }>,
  ): void;
}>;

/**
 * The whole of the attribute this editor writes — the same list it clears
 * before writing, and the one it declares to a caller rebasing its save.
 */
const OWNED_PROPERTIES = ['validation'];

/** Dedicated surface for one existing variable's validation rules. */
export default function CodebookVariableValidationEditor({
  openId,
  subject,
  variableId,
  authoritativeEntityDocument,
  allSubjectVariables,
  readOnly = false,
  onSubmitDocument,
  onComplete,
}: CodebookVariableValidationEditorProps) {
  const intl = useAppIntl();
  const authoritativeVariable = variableFromDocument(
    authoritativeEntityDocument,
    variableId,
  );
  const committedValidation =
    authoritativeVariable === undefined
      ? {}
      : validationFromVariable(authoritativeVariable);
  const authoritativeVariableType =
    authoritativeVariable !== undefined &&
    typeof authoritativeVariable.type === 'string'
      ? authoritativeVariable.type
      : '';

  const [openKey, setOpenKey] = useState(openId);
  const [validation, setValidation] = useState<ValidationMap>(
    () => committedValidation,
  );
  // The type this surface OPENED on, and the type its rules are ABOUT: the
  // researcher wrote them against it, so it is what the rule list is drawn
  // from, and a collaborator changing the attribute's type underneath leaves
  // them written for something the attribute no longer is.
  const [openedOnType, setOpenedOnType] = useState(authoritativeVariableType);
  // A record rather than the sentence, so a second refusal saying the same
  // thing is still a new failure for the effect below to move focus to.
  const [failure, setFailure] =
    useState<Readonly<{ message: string; held: boolean }>>();
  const [busy, setBusy] = useState(false);
  const failureRef = useRef<HTMLDivElement>(null);

  // The caller's open identity owns reset semantics: reconstructed protocol
  // documents must not erase a dirty draft while the same surface is open.
  if (openKey !== openId) {
    setOpenKey(openId);
    setValidation(committedValidation);
    setOpenedOnType(authoritativeVariableType);
    setFailure(undefined);
    setBusy(false);
  }

  useEffect(() => {
    if (failure !== undefined) failureRef.current?.focus();
  }, [failure]);

  const attributeUnavailable = authoritativeVariable === undefined;
  const attributeTypeChanged =
    !attributeUnavailable && authoritativeVariableType !== openedOnType;
  const variablesForValidation = useMemo(() => {
    if (
      authoritativeVariable === undefined ||
      Object.hasOwn(allSubjectVariables, variableId)
    ) {
      return allSubjectVariables;
    }
    return Object.fromEntries([
      ...Object.entries(allSubjectVariables),
      [variableId, authoritativeVariable],
    ]);
  }, [allSubjectVariables, authoritativeVariable, variableId]);
  const issue = attributeUnavailable
    ? intl.formatMessage(messages.attributeMissingIssue)
    : attributeTypeChanged
      ? intl.formatMessage(messages.typeChangedIssue)
      : (missingTargetIssue(validation, variablesForValidation, intl) ??
        ruleMapIssue(validation, {
          allVariables: Object.fromEntries(
            Object.entries(variablesForValidation),
          ),
          currentVariableId: variableId,
          variableType: openedOnType,
        }));
  const dirty = canonicalize(validation) !== canonicalize(committedValidation);
  const variableName =
    authoritativeVariable !== undefined &&
    typeof authoritativeVariable.name === 'string'
      ? authoritativeVariable.name
      : variableId;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Stops at this form: a `Dialog` portals out of the DOM but stays a React
    // descendant, so React would otherwise hand this submit to the form the
    // editor was opened from — a prompt row, or the stage itself — and save
    // that instead. `preventDefault` alone only stops the browser's own
    // navigation, which is not what propagates here.
    event.stopPropagation();
    if (readOnly || busy || !dirty || issue !== undefined) return;
    setFailure(undefined);

    let document: SectionDoc;
    try {
      document = documentWithUpdatedVariable({
        subject,
        authoritativeDocument: authoritativeEntityDocument,
        variableId,
        draft: { validation: Object.fromEntries(Object.entries(validation)) },
        replaceProperties: OWNED_PROPERTIES,
      });
    } catch {
      setFailure({
        message: codebookRefusalMessage({ kind: 'unexplained' }),
        held: false,
      });
      return;
    }

    setBusy(true);
    try {
      const outcome = await onSubmitDocument(document, OWNED_PROPERTIES);
      if (outcome.status === 'applied') {
        onComplete?.(outcome);
        return;
      }
      setFailure({
        message: outcome.message,
        held: outcome.refusal.kind === 'held',
      });
    } catch {
      setFailure({
        message: codebookRefusalMessage({ kind: 'unexplained' }),
        held: false,
      });
    } finally {
      setBusy(false);
    }
  };

  // Opened from a dialog, whose own title is the heading above this one: an
  // `h2` written out here sat beside the dialog's title instead of under it,
  // and every alert this editor raises counted from the dialog and landed
  // beside this title in turn.
  const enclosingHeadingLevel = useEnclosingHeadingLevel();
  const headingTag =
    enclosingHeadingLevel === null
      ? 'h2'
      : headingTagBelow(enclosingHeadingLevel);

  const saveLabel = intl.formatMessage(
    busy ? codebookEditingMessages.saving : messages.submit,
  );

  return (
    <Surface spacing="md" shadow="md" noContainer>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="flex flex-col gap-6">
          <div>
            <Heading
              level="h2"
              margin="none"
              // The element only — `level` still carries the type treatment.
              {...(headingTag === 'h2'
                ? {}
                : { render: createElement(headingTag) })}
            >
              {intl.formatMessage(messages.title, { name: variableName })}
            </Heading>
            <Paragraph emphasis="muted" margin="none">
              {intl.formatMessage(messages.description)}
            </Paragraph>
          </div>

          <EnclosingHeadingLevel level={headingTag}>
            {attributeTypeChanged && (
              <Alert variant="warning" appearance="soft" density="compact">
                <AlertTitle>
                  {intl.formatMessage(messages.typeChangedTitle)}
                </AlertTitle>
                <AlertDescription>
                  {intl.formatMessage(messages.typeChangedDescription)}
                </AlertDescription>
              </Alert>
            )}

            {failure !== undefined && (
              <Alert
                ref={failureRef}
                // A section somebody else is holding is not a fault: the change
                // is fine and lands once they are finished, so it is said in
                // the register of a notice rather than of an error.
                variant={failure.held ? 'warning' : 'destructive'}
                appearance="soft"
                density="compact"
                tabIndex={-1}
              >
                <AlertTitle>
                  {intl.formatMessage(messages.failureTitle)}
                </AlertTitle>
                <AlertDescription>
                  {/* Decoded here, not where it was raised: a refusal stands
                      until the next save, so it follows a change of language
                      while it waits. One already written for a researcher is
                      not ours to decode and passes through. */}
                  {formatMessageError(failure.message, intl) ?? failure.message}
                </AlertDescription>
              </Alert>
            )}

            {attributeUnavailable ? (
              <Alert variant="destructive" appearance="soft" density="compact">
                <AlertTitle>
                  {intl.formatMessage(messages.attributeUnavailableTitle)}
                </AlertTitle>
                <AlertDescription>
                  {intl.formatMessage(messages.attributeUnavailableDescription)}
                </AlertDescription>
              </Alert>
            ) : (
              <VariableValidationEditor
                entity={subject.entity}
                variableType={openedOnType}
                currentVariableId={variableId}
                allVariables={variablesForValidation}
                value={validation}
                onChange={setValidation}
                readOnly={readOnly || busy || attributeTypeChanged}
              />
            )}

            <div className="flex flex-wrap justify-end gap-3">
              <Button
                type="submit"
                color="primary"
                disabled={readOnly || busy || !dirty || issue !== undefined}
              >
                {saveLabel}
              </Button>
            </div>
          </EnclosingHeadingLevel>
        </div>
      </form>
    </Surface>
  );
}
