import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import { createProtocolObjectId } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  attributeField,
  closeAttributePicker,
  openAttributePicker,
} from '../../testing/attributePicker.ts';
import { testTypeId, testVariableId } from '../../testing/testId.ts';
import {
  type FormAnswerScope,
  formAnswerGroups,
  FormAnswerScopeProvider,
  formAnswerScopeOf,
} from '../formAnswerScope.ts';
import type { RuleDraft } from '../rule.ts';
import RuleEditorDialog from '../RuleEditorDialog.tsx';
import { ruleSetTargets } from '../ruleSet.ts';
import { RuleEditorHost, STAGE_SECTION } from './ruleEditorHost.tsx';

const PERSON = testTypeId('person');
const AGE = testVariableId('age');
const NOTE = testVariableId('note');
const FLAG = testVariableId('flag');

const person = {
  name: 'Person',
  color: 'node-color-seq-2',
  shape: { default: 'square' },
  variables: {
    [AGE]: { name: 'Age', type: 'number', component: 'Number' },
    [NOTE]: { name: 'Note', type: 'text', component: 'Text' },
    [FLAG]: { name: 'Flag', type: 'boolean', component: 'Boolean' },
  },
} as const;

const STAGE_ID = createProtocolObjectId();

const SECTIONS: Record<string, SectionDoc> = {
  [sectionId({ kind: 'settings' })]: {
    name: 'Form answers',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
  },
  [sectionId({ kind: 'stageOrder' })]: { stages: [STAGE_ID] },
  [STAGE_SECTION]: {
    id: STAGE_ID,
    type: 'AlterForm',
    label: { en: 'Details' },
    subject: { entity: 'node', type: PERSON },
  },
  [sectionId({ kind: 'codebookNode', typeId: PERSON })]: person,
};

/** Age is asked above the logic block, and Flag inside it. */
const SCOPE: FormAnswerScope = {
  outside: new Set([AGE]),
  inside: new Set([FLAG]),
  elsewhere: new Set(),
};

const RULE: RuleDraft = {
  id: createProtocolObjectId(),
  type: 'node',
  options: { type: PERSON, attribute: NOTE, operator: 'EXISTS' },
};

const renderRule = (scope: FormAnswerScope | undefined) =>
  render(
    <RuleEditorHost sections={SECTIONS}>
      <FormAnswerScopeProvider value={scope}>
        <RuleEditorDialog
          open
          seed={RULE}
          ruleTypes={[{ label: 'Node', value: 'node' }]}
          allowedTargets={ruleSetTargets('filter')}
          onSave={() => undefined}
          onCancel={() => undefined}
        />
      </FormAnswerScopeProvider>
    </RuleEditorHost>,
  );

/** Each group of the open list, with the ids of its attributes. */
const groupsIn = (popup: HTMLElement) =>
  Object.fromEntries(
    [...popup.querySelectorAll<HTMLElement>('[data-attribute-group]')].map(
      (group) => [
        group.dataset.attributeGroup ?? '',
        [
          ...group.querySelectorAll<HTMLElement>(
            '[role="option"][data-attribute-id]',
          ),
        ].map(
          (row) =>
            `${row.dataset.attributeId ?? ''}${row.dataset.unavailable === undefined ? '' : ' (not available)'}`,
        ),
      ],
    ),
  );

describe('a rule of a logic block in a form', () => {
  it('lists the answers on the form first, then the attributes recorded before it', async () => {
    const user = userEvent.setup();
    renderRule(SCOPE);
    const popup = await openAttributePicker(
      user,
      await waitFor(() => attributeField('Node attribute')),
    );

    expect(groupsIn(popup)).toEqual({
      'form-answers': [AGE, `${FLAG} (not available)`],
      'earlier-answers': [NOTE],
    });
    await closeAttributePicker(user);
  });

  it('lists the attributes without groups anywhere else', async () => {
    const user = userEvent.setup();
    renderRule(undefined);
    const popup = await openAttributePicker(
      user,
      await waitFor(() => attributeField('Node attribute')),
    );

    expect(popup.querySelector('[data-attribute-group]')).toBeNull();
    expect(screen.getAllByRole('option').length).toBeGreaterThanOrEqual(3);
    await closeAttributePicker(user);
  });
});

describe('formAnswerGroups', () => {
  const intl = createAppIntl({ locale: 'en', messages: {} });

  it('keeps a reason that the list already gives, and leaves out an empty group', () => {
    const groups = formAnswerGroups(
      [
        { value: AGE, label: 'Age' },
        { value: FLAG, label: 'Flag', unavailableReason: 'Not a number.' },
      ],
      SCOPE,
      intl,
    );

    expect(groups).toEqual([
      {
        id: 'form-answers',
        label: 'Answers on this form',
        options: [
          { value: AGE, label: 'Age' },
          { value: FLAG, label: 'Flag', unavailableReason: 'Not a number.' },
        ],
      },
    ]);
  });
});

describe('formAnswerScopeOf', () => {
  const intl = createAppIntl({ locale: 'en', messages: {} });

  /**
   * Age is asked above an outer logic block. One version of the outer block
   * contains an inner block, which asks Flag; the other version asks Note.
   * Seen from the inner block (as fresco-ui's `fieldScope()` gives it):
   */
  const innerBlockScope = {
    inside: ['flag-field'],
    otherVersions: ['note-field'],
    outside: ['age-field'],
  };
  const variables: Record<string, string> = {
    'age-field': AGE,
    'flag-field': FLAG,
    'note-field': NOTE,
  };

  it('treats a field in another version of an enclosing logic block as never shown with the nested block', () => {
    const scope = formAnswerScopeOf(innerBlockScope, (id) => variables[id]);

    expect(scope).toEqual({
      outside: new Set([AGE]),
      inside: new Set([FLAG]),
      elsewhere: new Set([NOTE]),
    });
    expect(
      formAnswerGroups(
        [
          { value: AGE, label: 'Age' },
          { value: FLAG, label: 'Flag' },
          { value: NOTE, label: 'Note' },
        ],
        scope,
        intl,
      ),
    ).toEqual([
      {
        id: 'form-answers',
        label: 'Answers on this form',
        options: [
          { value: AGE, label: 'Age' },
          {
            value: FLAG,
            label: 'Flag',
            unavailableReason:
              'A field inside this logic block collects this attribute, so it cannot decide which content the block shows.',
          },
          {
            value: NOTE,
            label: 'Note',
            unavailableReason:
              'This attribute is collected only by fields in another version of a logic block that contains this block, so those fields are never shown with this logic block.',
          },
        ],
      },
    ]);
  });

  it('puts each attribute in one set only, the fields outside the block first', () => {
    // Two fields collect Age: one outside the block, one inside it. A field
    // without an attribute yet is left out.
    const scope = formAnswerScopeOf(
      {
        inside: ['age-again', 'flag-field', 'unnamed'],
        otherVersions: ['flag-again', 'note-field'],
        outside: ['age-field'],
      },
      (id) =>
        ({ ...variables, 'age-again': AGE, 'flag-again': FLAG, 'unnamed': '' })[
          id
        ],
    );

    expect(scope).toEqual({
      outside: new Set([AGE]),
      inside: new Set([FLAG]),
      elsewhere: new Set([NOTE]),
    });
  });
});
