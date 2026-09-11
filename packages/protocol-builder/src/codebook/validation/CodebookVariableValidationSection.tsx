import { isEqual } from 'es-toolkit';
import { useRef, useState } from 'react';

import {
  defineMessages,
  formatMessageError,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Section from '@codaco/fresco-ui/Section';

import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  variablesForSubject,
  type CodebookSubject,
} from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import { documentWithUpdatedVariable } from '../editing.ts';
import {
  isValidationMap,
  ruleMapIssue,
  type ValidationMap,
} from '../variableValidation.ts';
import { useCodebookSectionWrite } from '../writes.ts';
import VariableValidationEditor from './VariableValidationEditor.tsx';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.variableValidation.sectionTitle',
    defaultMessage: 'Validation',
    description:
      'Heading of the nested section holding the rules an answer to one attribute has to satisfy. An attribute is one field the protocol records about a network member or about the participant.',
  },
  description: {
    id: 'protocolBuilder.variableValidation.sectionDescription',
    defaultMessage: 'Enable to add validation rules to the attribute.',
    description:
      'Description under the heading of the nested validation section, saying what switching it on does. Shown beside a switch, so it is written as an instruction about the switch.',
  },
});

export type CodebookVariableValidationSectionProps = Readonly<{
  /** The type whose attribute is being ruled. `undefined` while none is chosen. */
  subject: CodebookSubject | undefined;
  /** The attribute, as the field above this section holds it. */
  variableId: string | undefined;
  /**
   * Said in place of the default description.
   *
   * A DESCRIPTOR, because the words belong to the section that mounts this:
   * a categorical bin's follow-up attribute is not "the attribute", it is the
   * other one, and Architect names it so. See `CategoricalBinPromptsSection`.
   */
  description?: MessageDescriptor;
  /** Whether the field above this section is itself unavailable. */
  disabled?: boolean;
}>;

/**
 * The rules one codebook attribute's answers have to satisfy, edited where the
 * attribute is chosen.
 *
 * Architect renders this beneath every picker that binds an attribute the
 * participant TYPES into — quick add, the composer's quick add, the pedigree's
 * display label, a categorical bin's follow-up — because the attribute's own
 * rules are all that stand between the participant and an answer the study
 * cannot use, and sending the researcher to the codebook surface to set them
 * loses the thread they were on.
 *
 * The rules belong to the codebook rather than to the stage, so every
 * committable change is written straight to the codebook variable under the
 * section's own lock: cancelling the stage edit does not undo one, and saving
 * the stage submits none. A map that is half-set or contradictory is not
 * written at all — the rule row states what is wrong with it and the
 * researcher corrects it, rather than the rule being silently dropped.
 */
export default function CodebookVariableValidationSection({
  subject,
  variableId,
  description,
  disabled = false,
}: CodebookVariableValidationSectionProps) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const { readOnly } = useStageEditorForm();
  const variables =
    subject === undefined ? {} : variablesForSubject(protocolContext, subject);
  const variable = variableId === undefined ? undefined : variables[variableId];

  if (
    subject === undefined ||
    variableId === undefined ||
    variable === undefined
  ) {
    return null;
  }

  return (
    <VariableValidationSection
      // Remounted for each attribute, so the rules on screen, the open state
      // and any standing refusal all belong to the attribute the field holds
      // now rather than to the one it held a moment ago.
      key={`${subject.entity}:${'type' in subject ? subject.type : ''}:${variableId}`}
      subject={subject}
      variableId={variableId}
      variables={variables}
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(description ?? messages.description)}
      disabled={disabled || readOnly}
    />
  );
}

/** An attribute's own rules, read structurally off the codebook's union. */
const validationOf = (variable: unknown): ValidationMap => {
  if (typeof variable !== 'object' || variable === null) return {};
  const validation = Reflect.get(variable, 'validation');
  return isValidationMap(validation) ? validation : {};
};

const propertyOf = (variable: unknown, key: string): unknown =>
  typeof variable === 'object' && variable !== null
    ? Reflect.get(variable, key)
    : undefined;

/**
 * The kind of answer the attribute holds, which is what decides the rules on
 * offer. Read structurally for the reason `validationOf` is: the context hands
 * back the codebook's whole variable union.
 */
const typeOf = (variable: unknown): string => {
  const type = propertyOf(variable, 'type');
  return typeof type === 'string' ? type : '';
};

/** What a refused write says, and in which register it says it. */
type Refusal = Readonly<{ message: string; held: boolean }>;

function VariableValidationSection({
  subject,
  variableId,
  variables,
  title,
  description,
  disabled,
}: Readonly<{
  subject: CodebookSubject;
  variableId: string;
  variables: Readonly<Record<string, unknown>>;
  title: string;
  description: string;
  disabled: boolean;
}>) {
  const intl = useAppIntl();
  const write = useCodebookSectionWrite();
  const variable = variables[variableId];
  const committed = validationOf(variable);
  const variableType = typeOf(variable);

  /**
   * The rule map on screen, which is the codebook's plus whatever the
   * researcher has switched on and not finished answering.
   *
   * Held here rather than read straight from the codebook because an
   * incomplete rule is deliberately not written: a `minLength` switched on
   * with no number yet has to stay on screen to be corrected, and a value read
   * back from the protocol would take it away again on the next render.
   */
  const [draft, setDraft] = useState<ValidationMap>(committed);
  const [refusal, setRefusal] = useState<Refusal | undefined>(undefined);
  // Adjusted during render rather than in an effect: a change a collaborator
  // made is the codebook moving under the editor, and showing the rules it
  // replaced for a frame first is showing the researcher something untrue.
  const seen = useRef(committed);
  if (!isEqual(seen.current, committed)) {
    seen.current = committed;
    setDraft(committed);
  }

  const commit = async (next: ValidationMap): Promise<boolean> => {
    setRefusal(undefined);
    const outcome = await write(subject, (authoritativeDocument) =>
      documentWithUpdatedVariable({
        subject,
        authoritativeDocument,
        variableId,
        // An empty map REMOVES the key rather than storing `{}`: absence is
        // how the protocol schema spells "no rules", and a stored empty object
        // would go on saying something about an attribute nothing constrains.
        draft: Object.keys(next).length === 0 ? {} : { validation: next },
        replaceProperties: ['validation'],
      }),
    );
    if (outcome.status !== 'applied') {
      setRefusal({
        message: outcome.message,
        held: outcome.refusal.kind === 'held',
      });
      return false;
    }
    return true;
  };

  const handleChange = (next: ValidationMap) => {
    setDraft(next);
    if (isEqual(next, committed)) return;
    // Written only while the whole map is answerable. Architect's section has
    // no submit to refuse a half-set or contradictory map with either, so the
    // map simply does not reach the codebook and the row that is wrong says
    // what is wrong with it.
    if (
      ruleMapIssue(next, {
        allVariables: { ...variables },
        currentVariableId: variableId,
        variableType,
        options: propertyOf(variable, 'options'),
        component: propertyOf(variable, 'component'),
        parameters: propertyOf(variable, 'parameters'),
      }) !== undefined
    ) {
      return;
    }
    void commit(next);
  };

  return (
    <Section
      title={title}
      description={description}
      disabled={disabled}
      toggleable
      defaultOpen={Object.keys(committed).length > 0}
      onOpenChange={async (open) => {
        if (open) return true;
        // Cleared silently, as Architect clears it: the rules are the
        // attribute's own and the switch is the whole of the gesture. A
        // refused write has removed nothing, so the panel stays open over the
        // rules the codebook still holds and the switch stays where the
        // researcher left it.
        if (Object.keys(committed).length === 0) {
          setDraft({});
          return true;
        }
        return await commit({});
      }}
    >
      {refusal !== undefined && (
        <Alert
          variant={refusal.held ? 'warning' : 'destructive'}
          density="compact"
        >
          <AlertDescription>
            {formatMessageError(refusal.message, intl) ?? refusal.message}
          </AlertDescription>
        </Alert>
      )}
      <VariableValidationEditor
        entity={subject.entity}
        variableType={variableType}
        currentVariableId={variableId}
        allVariables={variables}
        value={draft}
        onChange={handleChange}
        readOnly={disabled}
      />
    </Section>
  );
}
