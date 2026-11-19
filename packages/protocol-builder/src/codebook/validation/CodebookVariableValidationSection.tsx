import { isEqual } from 'es-toolkit';
import { useState } from 'react';

import {
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
import { validationSectionMessages } from '../codebookMessages.ts';
import { documentWithUpdatedVariable } from '../editing.ts';
import {
  isValidationMap,
  ruleMapIssueForWrite,
  rulesSurvivingTypeChange,
  type StageRendering,
  type ValidationMap,
} from '../variableValidation.ts';
import { useCodebookSectionWrite } from '../writes.ts';
import VariableValidationEditor from './VariableValidationEditor.tsx';

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
  /**
   * How the STAGE renders the attributes these rules compare, where the
   * codebook does not decide it — see `StageRendering`.
   *
   * Only a network composer's row passes one: its field keeps its own
   * `component` and `parameters` on the stage, and a rule comparing this
   * answer with another the same form asks for is satisfiable or not in the
   * renderings BOTH arrive with. Judged against the codebook's renderings
   * alone, a contradiction that row can author goes unreported and a
   * comparison its own controls make satisfiable is blocked.
   */
  stageRendering?: StageRendering;
  /**
   * Rules the mounting stage cannot let the researcher switch on, each with
   * the sentence saying why (see `VariableValidationEditor`).
   */
  unavailableRules?: Readonly<Record<string, string>>;
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
 * The rules belong to the codebook rather than to the stage, but changing them
 * here is part of the researcher's edit of the stage: every committable change
 * is kept with the stage's draft (see `StagedCodebookStore`), so the stage has
 * unsaved work, saving it writes the rules with it, and cancelling it — or the
 * dialog this section sits in — throws them away. A map that is half-set or
 * contradictory is not kept at all — the rule row states what is wrong with it
 * and the researcher corrects it, rather than the rule being silently
 * dropped.
 */
export default function CodebookVariableValidationSection({
  subject,
  variableId,
  description,
  disabled = false,
  stageRendering,
  unavailableRules,
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
      title={intl.formatMessage(validationSectionMessages.sectionTitle)}
      description={intl.formatMessage(
        description ?? validationSectionMessages.sectionDescription,
      )}
      disabled={disabled || readOnly}
      {...(stageRendering === undefined ? {} : { stageRendering })}
      {...(unavailableRules === undefined ? {} : { unavailableRules })}
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

/** What a refused change says, and in which register it says it. */
type Refusal = Readonly<{ message: string; held: boolean }>;

function VariableValidationSection({
  subject,
  variableId,
  variables,
  title,
  description,
  disabled,
  stageRendering,
  unavailableRules,
}: Readonly<{
  subject: CodebookSubject;
  variableId: string;
  variables: Readonly<Record<string, unknown>>;
  title: string;
  description: string;
  disabled: boolean;
  stageRendering?: StageRendering;
  unavailableRules?: Readonly<Record<string, string>>;
}>) {
  const intl = useAppIntl();
  const write = useCodebookSectionWrite();
  const variable = variables[variableId];
  const committed = validationOf(variable);
  const variableType = typeOf(variable);

  /**
   * The rule map on screen, which is the codebook's (as the stage editor shows
   * it) plus whatever the researcher has switched on and not finished
   * answering.
   *
   * Held here rather than read straight from the codebook because an
   * incomplete rule is deliberately not kept: a `minLength` switched on with
   * no number yet has to stay on screen to be corrected, and a value read back
   * from the codebook would take it away again on the next render.
   */
  const [draft, setDraft] = useState<ValidationMap>(committed);
  const [refusal, setRefusal] = useState<Refusal | undefined>(undefined);
  /**
   * Bumped to re-seed the switch from the codebook, and nothing else.
   *
   * `Section` takes `defaultOpen` as an initial value and ignores later ones,
   * which is right for a panel the researcher opened — an ordinary re-render
   * must not reopen one they closed. It is wrong for a change made somewhere
   * else (a collaborator's, arriving in the protocol): a rule they added would
   * sit behind a switch saying there are none, and rules they cleared would
   * leave the switch on over nothing. So the panel is re-seeded, and only for
   * changes this section did not make.
   */
  const [switchGeneration, setSwitchGeneration] = useState(0);
  /**
   * The rules this section last asked the codebook for.
   *
   * The codebook moving because this section changed it is not news to the
   * researcher, and re-seeding the switch on it would close the panel the
   * moment they took the last rule off — mid-edit, over a section they still
   * have open.
   */
  const [asked, setAsked] = useState<ValidationMap | undefined>(undefined);
  // Adjusted during render rather than in an effect: a change made elsewhere
  // is the codebook moving under the editor, and showing the rules it
  // replaced for a frame first is showing the researcher something untrue.
  const [seen, setSeen] = useState(committed);
  /**
   * The kind of answer the rules on screen were chosen for.
   *
   * A collaborator can change it while this section is open, and a rule the
   * researcher switched on but has not finished answering is held HERE rather
   * than in the codebook — so nothing about the change would take it away. Left
   * where it was, it is a rule the new kind's editor does not draw and the
   * schema will not accept: every later change the researcher makes is refused
   * by `ruleMapIssue` over a row nobody can see, and the section stops keeping
   * anything without saying why. So the draft follows the kind, by the same
   * reading of which rules survive one that the codebook's own type control
   * and a form-field row use.
   */
  const [seenType, setSeenType] = useState(variableType);
  if (!isEqual(seen, committed)) {
    const ours = asked !== undefined && isEqual(asked, committed);
    setAsked(undefined);
    setSeen(committed);
    setSeenType(variableType);
    setDraft(committed);
    if (!ours) setSwitchGeneration((generation) => generation + 1);
  } else if (seenType !== variableType) {
    setSeenType(variableType);
    setDraft((held) => rulesSurvivingTypeChange(held, variableType).kept);
  }

  /** What is wrong with a rule map, in the words the rows state it in. */
  const ruleMapRefusal = (map: Readonly<ValidationMap>): string | undefined =>
    ruleMapIssueForWrite(
      map,
      {
        allVariables: { ...variables },
        currentVariableId: variableId,
        variableType,
        options: propertyOf(variable, 'options'),
      },
      // The attribute's own control and settings are already on the record in
      // `variables`, which is what the analyser reads them from; only a STAGE
      // that renders it with something else has anything to add.
      stageRendering,
    );

  /**
   * Gives the attribute these rules: kept with the stage's draft, and saved
   * with it (see `useCodebookSectionWrite`). Whole, because the map on screen
   * is the attribute's as the editor shows it; what a collaborator changes
   * meanwhile is kept when the stage is saved, rule by rule (`mergeEdit`).
   */
  const commit = async (next: ValidationMap): Promise<boolean> => {
    setRefusal(undefined);
    setAsked(next);
    const outcome = await write(subject, (document) =>
      documentWithUpdatedVariable({
        subject,
        authoritativeDocument: document,
        variableId,
        // An empty map REMOVES the key rather than storing `{}`: absence is
        // how the protocol schema spells "no rules", and a stored empty
        // object would go on saying something about an attribute nothing
        // constrains.
        draft: Object.keys(next).length === 0 ? {} : { validation: next },
        replaceProperties: ['validation'],
      }),
    );
    if (outcome.status === 'applied') return true;
    // The marker says the codebook moved because THIS section moved it, and a
    // refused change moved nothing.
    setAsked((standing) => (standing === next ? undefined : standing));
    setRefusal({
      message: outcome.message,
      held: outcome.refusal.kind === 'held',
    });
    return false;
  };

  const handleChange = (next: ValidationMap) => {
    // Cleared for every edit, not only for one that is kept: a refusal is
    // about the map that was refused, and an edit that reverts it or leaves it
    // half-set is a map the standing sentence no longer describes.
    setRefusal(undefined);
    setDraft(next);
    if (isEqual(next, committed)) return;
    // Kept only while the whole map is answerable. Architect's section has no
    // submit to refuse a half-set or contradictory map with either, so the map
    // simply does not reach the codebook and the row that is wrong says what
    // is wrong with it.
    if (ruleMapRefusal(next) !== undefined) return;
    void commit(next);
  };

  return (
    <Section
      key={switchGeneration}
      title={title}
      description={description}
      disabled={disabled}
      toggleable
      defaultOpen={Object.keys(committed).length > 0}
      onOpenChange={async (open) => {
        if (open) return true;
        // Cleared silently, as Architect clears it: the rules are the
        // attribute's own and the switch is the whole of the gesture. A
        // refused change has removed nothing, so the panel stays open over the
        // rules the codebook still holds and the switch stays where the
        // researcher left it.
        if (Object.keys(committed).length === 0) {
          setDraft({});
          return true;
        }
        const cleared = await commit({});
        if (cleared) setDraft({});
        return cleared;
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
        {...(stageRendering === undefined ? {} : { stageRendering })}
        {...(unavailableRules === undefined
          ? {}
          : {
              unavailableRules,
              // A rule the codebook holds has to stay switchable, whatever the
              // switch on screen says: a removal that was refused leaves the
              // switch off over a rule still held, and judged from the draft
              // it would lock there and never be retried.
              savedRules: Object.keys(committed),
            })}
      />
    </Section>
  );
}
