import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * Everything the narrative pedigree sections say.
 *
 * One file for the family rather than descriptors beside each section's
 * markup, because several of these ids are rendered somewhere else entirely:
 * the row noun the shared row list builds "Edit …", "Delete this …?" and its
 * write refusals around, and the refusals the disease list encodes for a form's
 * error region to decode. A translator reading this file sees the whole of what
 * a narrative pedigree says, wherever it is said.
 *
 * A narrative pedigree has no family of its own: it draws conditions onto the
 * family a Family Pedigree stage earlier in the interview collected, so almost
 * every sentence here is about that other stage, the attributes of its node
 * type, or how a condition travels through the family it holds.
 */
export const narrativePedigreeMessages = defineMessages({
  // ── The Family Pedigree stage this one reads ──────────────────────────────
  sourceTitle: {
    id: 'protocolBuilder.narrativePedigree.sourceTitle',
    defaultMessage: 'Pedigree source',
    description:
      'Heading of the section where a researcher chooses which earlier step of the interview collected the family this step draws on. A pedigree is a family tree.',
  },
  sourceDescription: {
    id: 'protocolBuilder.narrativePedigree.sourceDescription',
    defaultMessage:
      'Choose the Family Pedigree stage whose family this stage visualizes.',
    description:
      'Description of the pedigree-source section. "Family Pedigree" is the name of another kind of interview step, the one in which the participant builds their family tree; a stage is one step of an interview.',
  },
  sourceLabel: {
    id: 'protocolBuilder.narrativePedigree.sourceLabel',
    defaultMessage: 'Source stage',
    description:
      'Label of the control naming which earlier step of the interview collected the family this one draws on.',
  },
  sourceHint: {
    id: 'protocolBuilder.narrativePedigree.sourceHint',
    defaultMessage:
      'Only Family Pedigree stages that run before this one are listed: the family has to be drawn before it can be shown.',
    description:
      'Guidance under the source-stage control, explaining why the list is shorter than the interview. "Family Pedigree" names another kind of interview step; a stage is one step of an interview.',
  },
  sourcePlaceholder: {
    id: 'protocolBuilder.narrativePedigree.sourcePlaceholder',
    defaultMessage: 'Select a Family Pedigree stage...',
    description:
      'Placeholder shown in the source-stage control while no stage has been chosen. The trailing dots are an ellipsis written as three full stops.',
  },
  sourceEmptyTitle: {
    id: 'protocolBuilder.narrativePedigree.sourceEmptyTitle',
    defaultMessage: 'No pedigree to read',
    description:
      'Heading of the notice shown above the source-stage control when the interview holds no family tree this stage could draw. The control itself stays on screen, disabled.',
  },
  sourceEmptyMessage: {
    id: 'protocolBuilder.narrativePedigree.sourceEmptyMessage',
    defaultMessage:
      'This interview has no Family Pedigree stage before this one. Add one, or move this stage later, before configuring it.',
    description:
      'Body of the notice shown above the source-stage control when nothing in the interview qualifies; the control itself stays on screen, disabled. "Family Pedigree" names the kind of interview step that collects a family tree.',
  },
  sourceProblemTitle: {
    id: 'protocolBuilder.narrativePedigree.sourceProblemTitle',
    defaultMessage: 'This stage has no family to show',
    description:
      'Heading of the warning shown when the stage this one was pointed at can no longer be used. The sentence under it says which of the three things went wrong.',
  },
  sourceStageOption: {
    id: 'protocolBuilder.narrativePedigree.sourceStageOption',
    defaultMessage: 'Stage {position, number} \u2014 {stageLabel}',
    description:
      'One Family Pedigree stage offered as the one this stage draws its family from. position is where that stage will sit in the finished interview, counting from one; stageLabel is the researcher\u2019s own name for it and is not translated. The number is shown because two stages may carry the same name.',
  },
  sourceUnusableOption: {
    id: 'protocolBuilder.narrativePedigree.sourceUnusableOption',
    defaultMessage: '{stageName} — this stage can no longer be used',
    description:
      'How the stored choice is labelled inside the source-stage list once it can no longer be used, so the researcher can still see what this stage points at. stageName is the researcher’s own name for that stage and is not translated, or — where the stage has left the interview and there is no name left to read — its identifier.',
  },
  sourceMissing: {
    id: 'protocolBuilder.narrativePedigree.sourceMissing',
    defaultMessage:
      'The Family Pedigree stage this one reads is no longer part of the interview. Choose another one, or restore it, before this stage can be saved.',
    description:
      'Shown when the stage this one draws its family from has been deleted or dropped out of the interview — usually by a collaborator, while this editor was open.',
  },
  sourceNotAPedigree: {
    id: 'protocolBuilder.narrativePedigree.sourceNotAPedigree',
    defaultMessage:
      'The stage this one reads is no longer a Family Pedigree, so there is no family for it to visualize. Choose a Family Pedigree stage instead.',
    description:
      'Shown when the stage this one draws its family from has been changed to a different kind of interview step, so it no longer collects a family tree.',
  },
  sourceAfterThisStage: {
    id: 'protocolBuilder.narrativePedigree.sourceAfterThisStage',
    defaultMessage:
      'The Family Pedigree stage this one reads now runs after it, so the family would still be empty. Move it earlier in the interview, or choose a pedigree that runs before this stage.',
    description:
      'Shown when the stage this one draws its family from has been moved to run later in the interview, so the participant would not have built the family yet.',
  },

  sourceChangeTitle: {
    id: 'protocolBuilder.narrativePedigree.sourceChangeTitle',
    defaultMessage: 'This will remove every disease',
    description:
      'Title of the confirmation shown before a researcher points this stage at a different Family Pedigree stage. Every disease it draws names an attribute of the current pedigree\u2019s family members, so changing the pedigree discards all of them.',
  },
  sourceChangeDescription: {
    id: 'protocolBuilder.narrativePedigree.sourceChangeDescription',
    defaultMessage:
      'Each disease names an attribute of the family members the current pedigree collects, so none of them would still describe the new one. Choosing a different pedigree removes them all, and choosing this one again does not bring them back.',
    description:
      'Body of the confirmation shown before a narrative pedigree\u2019s source changes, saying what the change discards and that reversing the choice does not undo it.',
  },
  sourceChangeConfirm: {
    id: 'protocolBuilder.narrativePedigree.sourceChangeConfirm',
    defaultMessage: 'Change the pedigree',
    description:
      'Button that confirms pointing a narrative pedigree at a different Family Pedigree stage and discarding every disease that described the previous one.',
  },

  // ── The list of conditions drawn on that family ───────────────────────────
  diseasesTitle: {
    id: 'protocolBuilder.narrativePedigree.diseasesTitle',
    defaultMessage: 'Diseases',
    description:
      'Heading of the section listing the conditions this step of the interview draws onto the family tree.',
  },
  diseasesDescription: {
    id: 'protocolBuilder.narrativePedigree.diseasesDescription',
    defaultMessage:
      'Define the conditions this stage draws on the family, and how each is inherited.',
    description:
      'Description of the diseases section. A stage is one step of an interview.',
  },
  diseasesWaitingDescription: {
    id: 'protocolBuilder.narrativePedigree.diseasesWaitingDescription',
    defaultMessage:
      'Choose the Family Pedigree stage this one reads before defining its diseases.',
    description:
      'Said instead of the diseases section’s description while no source stage has been chosen, so there is no family and no set of attributes to describe a disease against.',
  },
  diseasesFieldLabel: {
    id: 'protocolBuilder.narrativePedigree.diseasesFieldLabel',
    defaultMessage: 'Diseases',
    description:
      'Label of the list of conditions inside the diseases section. The same word as the section heading, and translated once for each: the heading names the part of the stage, and this names the control.',
  },
  diseasesFieldHint: {
    id: 'protocolBuilder.narrativePedigree.diseasesFieldHint',
    defaultMessage:
      "Each disease maps one boolean attribute of the source pedigree's family members. Drag to reorder them in the key.",
    description:
      'Guidance under the list of diseases. An attribute is one field of data recorded about a person; boolean is a yes/no attribute; the key is the legend the participant reads beside the family tree.',
  },
  diseasesAddLabel: {
    id: 'protocolBuilder.narrativePedigree.diseasesAddLabel',
    defaultMessage: 'Create new disease',
    description:
      'Button that opens the dialog for describing one more condition. Whole rather than a generic "Add", because a stage editor shows several lists at once and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },
  diseasesAddTitle: {
    id: 'protocolBuilder.narrativePedigree.diseasesAddTitle',
    defaultMessage: 'Create disease',
    description:
      'Title of the dialog a researcher fills in to describe one more condition.',
  },
  diseasesEditTitle: {
    id: 'protocolBuilder.narrativePedigree.diseasesEditTitle',
    defaultMessage: 'Edit disease',
    description:
      'Title of the dialog a researcher fills in to change a condition they have already described.',
  },
  diseaseNoun: {
    id: 'protocolBuilder.narrativePedigree.diseaseNoun',
    defaultMessage: 'disease',
    description:
      'What one row of the disease list is called inside things said ABOUT it — "Edit disease", "Delete this disease?" — so it is lower case and singular. A disease here is a condition the stage draws on the family tree.',
  },
  diseasesEmptyState: {
    id: 'protocolBuilder.narrativePedigree.diseasesEmptyState',
    defaultMessage:
      'No diseases yet. Create one to mark who in the family is affected.',
    description:
      'Shown in place of the disease list while this stage would draw nothing on the family.',
  },
  diseasesAtLeastOne: {
    id: 'protocolBuilder.narrativePedigree.diseasesAtLeastOne',
    defaultMessage:
      'Add at least one disease. A narrative pedigree with none shows the participant an unmarked family.',
    description:
      'Refusal shown above the disease list when a researcher saves a stage that would draw nothing. "Narrative pedigree" is the name of this kind of interview step.',
  },
  diseasesDuplicateVariable: {
    id: 'protocolBuilder.narrativePedigree.diseasesDuplicateVariable',
    defaultMessage:
      'This attribute is already mapped by another disease. Choose a different one, or edit the existing disease instead.',
    description:
      'Refusal shown under the attribute control in the disease dialog when a sibling disease already records who is affected under the attribute just chosen. An attribute is one field of data recorded about a person.',
  },
  diseasesNotRecorded: {
    id: 'protocolBuilder.narrativePedigree.diseasesNotRecorded',
    defaultMessage:
      'Nothing records this attribute, so nobody would be marked with it. Add a nomination prompt to the source pedigree asking who has this condition, then map it here.',
    description:
      'Refusal shown under the attribute control in the disease dialog when the chosen attribute is one no nomination prompt of the source Family Pedigree stage records — a mapping to it draws an unmarked family in every interview. A nomination prompt asks the participant who in the family a question applies to and marks everyone they name; "Nomination prompts" is the name of that part of the pedigree editor.',
  },
  diseasesMarkNobody: {
    id: 'protocolBuilder.narrativePedigree.diseasesMarkNobody',
    defaultMessage:
      '{count, plural, one {{diseaseNames} maps an attribute the source pedigree does not record, so nobody in the family would be marked with it. Add a nomination prompt to that pedigree asking who has it, or remove the disease.} other {{diseaseNames} map attributes the source pedigree does not record, so nobody in the family would be marked with them. Add a nomination prompt to that pedigree for each of them, or remove those diseases.}}',
    description:
      'Refusal shown above the disease list when one or more diseases already in it map an attribute no nomination prompt of the source Family Pedigree stage records \u2014 usually because a collaborator deleted that prompt, or the protocol was imported that way. count is how many such diseases there are; diseaseNames is their names, already joined into one phrase in the reader\u2019s language. A nomination prompt asks the participant who in the family a question applies to and marks everyone they name.',
  },
  diseaseMarksNobody: {
    id: 'protocolBuilder.narrativePedigree.diseaseMarksNobody',
    defaultMessage: 'Nothing records this attribute',
    description:
      'Badge shown on a collapsed row of the disease list when that disease maps an attribute the source Family Pedigree stage does not record, so the disease would mark nobody. Terse because it sits inside a row beside the disease\u2019s name.',
  },
  diseasesDuplicateLabel: {
    id: 'protocolBuilder.narrativePedigree.diseasesDuplicateLabel',
    defaultMessage:
      'Another disease already uses this name. Give this one a name participants can tell apart.',
    description:
      'Refusal shown under the name control in the disease dialog when a sibling disease already carries that name. The name is what the participant reads in the key beside the family tree, so two the same are indistinguishable on screen.',
  },

  // ── One disease: name, colour, attribute, inheritance ─────────────────────
  diseaseNameLabel: {
    id: 'protocolBuilder.narrativePedigree.diseaseNameLabel',
    defaultMessage: 'Disease name',
    description:
      'Label of the field holding what one condition is called in the key the participant reads.',
  },
  diseaseNameHint: {
    id: 'protocolBuilder.narrativePedigree.diseaseNameHint',
    defaultMessage:
      "Shown to the participant in the pedigree's key, so it should be a name they recognize.",
    description:
      'Guidance under the disease-name field. The key is the legend drawn beside the family tree, naming what each colour means.',
  },
  diseaseNamePlaceholder: {
    id: 'protocolBuilder.narrativePedigree.diseaseNamePlaceholder',
    defaultMessage: 'Enter a name for this disease...',
    description:
      'Placeholder shown in the empty disease-name field. The trailing dots are an ellipsis written as three full stops.',
  },
  diseaseNameRequired: {
    id: 'protocolBuilder.narrativePedigree.diseaseNameRequired',
    defaultMessage: 'Give this disease a name.',
    description:
      'Refusal shown under the disease-name field when the researcher saves the dialog having left it empty.',
  },
  diseaseColorLabel: {
    id: 'protocolBuilder.narrativePedigree.diseaseColorLabel',
    defaultMessage: 'Color',
    description:
      'Label of the control choosing which colour one condition is drawn in on the family tree.',
  },
  diseaseColorHint: {
    id: 'protocolBuilder.narrativePedigree.diseaseColorHint',
    defaultMessage: 'The color this disease is drawn in on the pedigree.',
    description:
      'Guidance under the disease-colour control. A pedigree is a family tree.',
  },
  diseaseColorRequired: {
    id: 'protocolBuilder.narrativePedigree.diseaseColorRequired',
    defaultMessage: 'Choose a color for this disease.',
    description:
      'Refusal shown under the disease-colour control when the researcher saves the dialog without choosing one.',
  },
  diseaseColorOption: {
    id: 'protocolBuilder.narrativePedigree.diseaseColorOption',
    defaultMessage: 'Color {position}',
    description:
      'How one entry of the disease-colour list is named. The palette’s colours have no names of their own — they are the study’s own theme colours — so they are counted instead. position identifies which one, counting from 1.',
  },
  diseaseVariableLabel: {
    id: 'protocolBuilder.narrativePedigree.diseaseVariableLabel',
    defaultMessage: 'Affected-status attribute',
    description:
      'Label of the control choosing which recorded field of a family member says whether they have this condition. An attribute is one field of data recorded about a person.',
  },
  diseaseVariableHint: {
    id: 'protocolBuilder.narrativePedigree.diseaseVariableHint',
    defaultMessage:
      'Only attributes a nomination prompt of the source pedigree records are offered. This stage draws what that prompt collected; it collects nothing itself.',
    description:
      'Guidance under the affected-status control, saying why the list is as short as it is. A nomination prompt is the part of a Family Pedigree stage that asks the participant who in the family a question applies to and marks everyone they name; "Nomination prompts" is what that part of the pedigree editor is called, so the two should read the same. The source pedigree is the earlier stage that collected the family.',
  },
  diseaseVariableEmpty: {
    id: 'protocolBuilder.narrativePedigree.diseaseVariableEmpty',
    defaultMessage:
      'There is no attribute for this disease to map. A disease can only map an attribute that a nomination prompt of the source pedigree records and that no other disease already maps. Add a nomination prompt to that pedigree asking who has this condition, and it can be mapped here.',
    description:
      'Said in place of the affected-status list when the source Family Pedigree stage leaves this disease nothing to map — either because no nomination prompt of it records an attribute this stage could draw, or because every attribute it does record is already mapped by another disease. It states the rule and what to do rather than which of the two it is, because the remedy is the same nomination prompt either way. "Nomination prompts" is the name of that part of the pedigree editor.',
  },
  diseaseVariableRequired: {
    id: 'protocolBuilder.narrativePedigree.diseaseVariableRequired',
    defaultMessage: 'Choose the attribute that records who is affected.',
    description:
      'Refusal shown under the affected-status control when the researcher saves the dialog without choosing one.',
  },
  diseaseInheritanceLabel: {
    id: 'protocolBuilder.narrativePedigree.diseaseInheritanceLabel',
    defaultMessage: 'Inheritance pattern',
    description:
      'Label of the control choosing how one condition travels from parent to child.',
  },
  diseaseInheritanceHint: {
    id: 'protocolBuilder.narrativePedigree.diseaseInheritanceHint',
    defaultMessage:
      'How the disease is passed on. Mendelian patterns let the pedigree infer carrier and at-risk statuses from biological relationships and recorded sex; multifactorial and unknown show affected status only.',
    description:
      'Guidance under the inheritance-pattern control. "Mendelian" describes the classical single-gene patterns; a carrier holds a condition without developing it; "multifactorial" and "unknown" are two of the choices in the list, and are written here in lower case because they are named inside a sentence.',
  },
  diseaseInheritancePlaceholder: {
    id: 'protocolBuilder.narrativePedigree.diseaseInheritancePlaceholder',
    defaultMessage: 'Select an inheritance pattern...',
    description:
      'Placeholder shown in the inheritance-pattern control while none has been chosen. The trailing dots are an ellipsis written as three full stops.',
  },
  diseaseInheritanceRequired: {
    id: 'protocolBuilder.narrativePedigree.diseaseInheritanceRequired',
    defaultMessage: 'Choose how this disease is inherited.',
    description:
      'Refusal shown under the inheritance-pattern control when the researcher saves the dialog without choosing one.',
  },
  diseaseVariableGone: {
    id: 'protocolBuilder.narrativePedigree.diseaseVariableGone',
    defaultMessage:
      'The attribute this disease maps ({attributeName}) is no longer in the codebook, so nothing can record who is affected. Choose another attribute.',
    description:
      'Refusal shown on the attribute control of a disease whose attribute has been deleted from the codebook while the researcher had the row open. attributeName is the stored identifier — there is no name left to show, because the definition has gone. An attribute is a codebook variable.',
  },
  diseaseVariableTypeChanged: {
    id: 'protocolBuilder.narrativePedigree.diseaseVariableTypeChanged',
    defaultMessage:
      '{attributeName} no longer records a yes-or-no answer, so it cannot say who is affected. Choose another attribute.',
    description:
      'Refusal shown on the attribute control of a disease whose attribute has been changed to another type while the researcher had the row open. attributeName is the attribute’s own name and is not translated. A disease is drawn from a true-or-false answer.',
  },
  diseaseUnnamed: {
    id: 'protocolBuilder.narrativePedigree.diseaseUnnamed',
    defaultMessage: 'Unnamed disease',
    description:
      'Stands in for the name in the collapsed row of the disease list while the researcher has not written one, so the row can still be told apart and opened.',
  },

  // ── The inheritance patterns, one per schema token ────────────────────────
  inheritanceAutosomalDominant: {
    id: 'protocolBuilder.narrativePedigree.inheritanceAutosomalDominant',
    defaultMessage: 'Autosomal dominant',
    description:
      'One choice in the inheritance-pattern list: a condition on a non-sex chromosome that one affected parent is enough to pass on. Standard clinical genetics terminology.',
  },
  inheritanceAutosomalRecessive: {
    id: 'protocolBuilder.narrativePedigree.inheritanceAutosomalRecessive',
    defaultMessage: 'Autosomal recessive',
    description:
      'One choice in the inheritance-pattern list: a condition on a non-sex chromosome that needs a copy from both parents. Standard clinical genetics terminology.',
  },
  inheritanceXLinkedDominant: {
    id: 'protocolBuilder.narrativePedigree.inheritanceXLinkedDominant',
    defaultMessage: 'X-linked dominant',
    description:
      'One choice in the inheritance-pattern list: a dominant condition carried on the X chromosome. Standard clinical genetics terminology; "X" is the chromosome’s letter and is not translated.',
  },
  inheritanceXLinkedRecessive: {
    id: 'protocolBuilder.narrativePedigree.inheritanceXLinkedRecessive',
    defaultMessage: 'X-linked recessive',
    description:
      'One choice in the inheritance-pattern list: a recessive condition carried on the X chromosome. Standard clinical genetics terminology; "X" is the chromosome’s letter and is not translated.',
  },
  inheritanceYLinked: {
    id: 'protocolBuilder.narrativePedigree.inheritanceYLinked',
    defaultMessage: 'Y-linked',
    description:
      'One choice in the inheritance-pattern list: a condition carried on the Y chromosome. Standard clinical genetics terminology; "Y" is the chromosome’s letter and is not translated.',
  },
  inheritanceMitochondrial: {
    id: 'protocolBuilder.narrativePedigree.inheritanceMitochondrial',
    defaultMessage: 'Mitochondrial',
    description:
      'One choice in the inheritance-pattern list: a condition passed on through the mother’s mitochondria. Standard clinical genetics terminology.',
  },
  inheritanceMultifactorial: {
    id: 'protocolBuilder.narrativePedigree.inheritanceMultifactorial',
    defaultMessage: 'Multifactorial',
    description:
      'One choice in the inheritance-pattern list: a condition arising from several genes and the environment together, so nothing can be inferred from the family tree alone.',
  },
  inheritanceUnknown: {
    id: 'protocolBuilder.narrativePedigree.inheritanceUnknown',
    defaultMessage: 'Unknown',
    description:
      'One choice in the inheritance-pattern list, said of the condition rather than of the researcher: how it is inherited has not been established, so only recorded status is drawn.',
  },

  // ── Whether inferred risk is drawn as well as recorded status ─────────────
  atRiskTitle: {
    id: 'protocolBuilder.narrativePedigree.atRiskTitle',
    defaultMessage: 'At-risk statuses',
    description:
      'Heading of the section deciding whether the family tree also marks people who MIGHT develop or carry a condition, as well as those recorded as having it.',
  },
  atRiskDescription: {
    id: 'protocolBuilder.narrativePedigree.atRiskDescription',
    defaultMessage:
      'Choose whether the pedigree also shows inferred risk alongside recorded status.',
    description:
      'Description of the at-risk statuses section. Inferred risk is worked out from the family structure; recorded status is what someone actually entered. A pedigree is a family tree.',
  },
  atRiskFieldLabel: {
    id: 'protocolBuilder.narrativePedigree.atRiskFieldLabel',
    defaultMessage: 'Show possible (at-risk) statuses',
    description:
      'Label of the switch turning inferred risk on. The bracketed words name what these are called on the family tree itself.',
  },
  atRiskFieldHint: {
    id: 'protocolBuilder.narrativePedigree.atRiskFieldHint',
    defaultMessage:
      'Off by default. At-risk symbols are inferred rather than observed, and are intended for clinician-directed use.',
    description:
      'Guidance under the at-risk switch, saying in one line why it starts off. The prose below the switch says the same thing at length.',
  },
  atRiskMeaning: {
    id: 'protocolBuilder.narrativePedigree.atRiskMeaning',
    defaultMessage:
      'When this is on, the pedigree also shows a person who <em>may develop</em> a condition or <em>may carry</em> it. These are drawn as the usual status symbol with a question mark (“?”) added. A solid, filled symbol always means a clinically <em>affected</em> individual, so at-risk relatives always appear as unfilled symbols marked with a “?”.',
    description:
      'First paragraph of the prose explaining at-risk statuses to a researcher. The <em> tags mark the three phrases drawn from standard pedigree nomenclature; the quoted question mark is the symbol drawn on the family tree, so it stays a question mark whatever quotation marks the language uses around it.',
  },
  atRiskHowHeading: {
    id: 'protocolBuilder.narrativePedigree.atRiskHowHeading',
    defaultMessage: 'How it is worked out',
    description:
      'Heading over the paragraphs explaining where an inferred at-risk status comes from.',
  },
  atRiskHowInferred: {
    id: 'protocolBuilder.narrativePedigree.atRiskHowInferred',
    defaultMessage:
      'At-risk statuses are not observed or diagnosed. They are inferred from the family structure together with each condition’s inheritance pattern — the child of a parent affected by a dominant condition and the child of two carriers of a recessive condition are both shown as <em>may develop</em> it, while a child with only one carrier parent is shown as <em>may carry</em> it.',
    description:
      'Says what an at-risk status is worked out from, with the examples the pedigree itself draws that way: a child of two carriers of a recessive condition inherits both copies in a quarter of cases, so it is drawn as "may develop" rather than as "may carry", which is what a child with one carrier parent is drawn as. The <em> tags mark the two phrases drawn from standard pedigree nomenclature; a carrier holds a condition without developing it.',
  },
  atRiskHowConstrained: {
    id: 'protocolBuilder.narrativePedigree.atRiskHowConstrained',
    defaultMessage:
      'Two rules constrain how risk travels through a family. Only <em>biological</em> and <em>donor</em> relationships pass conditions on; social, adoptive, surrogate and partner links do not. And where a person’s biological sex is not known, sex-linked inheritance through that person is left uncertain rather than guessed.',
    description:
      'Says the two limits on inference. The named relationship kinds — biological, donor, social, adoptive, surrogate, partner — are the ones a Family Pedigree stage records, so they should read the same here as they do there.',
  },
  atRiskWhyOffHeading: {
    id: 'protocolBuilder.narrativePedigree.atRiskWhyOffHeading',
    defaultMessage: 'Why this is off by default',
    description:
      'Heading over the paragraph explaining why inferred risk is not shown unless a researcher asks for it.',
  },
  atRiskWhyOff: {
    id: 'protocolBuilder.narrativePedigree.atRiskWhyOff',
    defaultMessage:
      'At-risk symbols are a strong visual signal that can be read as established fact rather than inferred risk. They are intended for <strong>clinician-directed use</strong>, where the result is interpreted in context. Standard pedigree nomenclature deliberately does not encode probabilistic risk, so leave this off unless a clinician is guiding interpretation.',
    description:
      'The argument for leaving inferred risk off. The <strong> tag marks the condition under which showing it is appropriate: a clinician deciding to, and reading the result. "Standard pedigree nomenclature" is the published convention for drawing family trees in clinical genetics.',
  },

  // ── The source picker's own refusal ───────────────────────────────────────
  sourceGoneTitle: {
    id: 'protocolBuilder.narrativePedigree.sourceGoneTitle',
    defaultMessage: 'That pedigree is no longer available',
    description:
      'Title of the message shown when a researcher agrees to change which family tree this step draws, and the stage they picked stopped being one this control offers while the question was open — a collaborator deleted it, changed what kind of step it is, or moved it later in the interview. The change is refused.',
  },
  sourceGone: {
    id: 'protocolBuilder.narrativePedigree.sourceGone',
    defaultMessage:
      'The pedigree you chose is no longer one of the options here, so nothing has changed and no disease has been removed. Choose again.',
    description:
      'Body of the message refusing a confirmed change of source pedigree whose chosen stage is no longer offered. Addressed to the researcher authoring the protocol, and it says what did NOT happen: the change was not applied and the disease mappings beside it were not thrown away.',
  },
});
