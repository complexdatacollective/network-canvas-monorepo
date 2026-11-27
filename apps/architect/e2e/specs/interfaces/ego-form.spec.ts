import {
  type CurrentProtocol,
  fieldBlockMarkdown,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readProtocolJson, readStageJson } from '../../helpers/read-store.js';
import {
  addFormField,
  closeFieldSettings,
  fieldBlock,
  fieldBlocks,
  focusFormEnd,
  formContent,
  openFieldSettings,
} from '../../pageobjects/editor-sections/forms.js';
import { authorOptions } from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid EgoForm stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('EgoForm');
  await editor.setStageName('About You');

  // An ego form is the one form interface with no subject section: it always
  // collects against the interview's ego, so its form is available from the
  // moment the editor opens. Its text opens the form, then the field.
  const form = editor.section('Form');
  await formContent(form).click();
  await architectPage.keyboard.type('Thanks for taking part in this study.');
  await addFormField(form, {
    variableName: 'age',
    promptText: 'What is your name?',
    inputControl: 'Text Input',
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('EgoForm');
  if (stage.type !== 'EgoForm') return;
  const [field] = stage.form.fields;
  expect(stage.form.content).toEqual({
    en: `Thanks for taking part in this study.\n\n${fieldBlockMarkdown(field?.id ?? '')}`,
  });
  expect(await stageSnapshotJson(stage)).toMatchSnapshot('ego-form-stage.json');
});

test('a form without a field cannot be saved', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('EgoForm');
  await editor.setStageName('About You');
  const form = editor.section('Form');

  // Text alone is not a form.
  await formContent(form).click();
  await architectPage.keyboard.type('Tell us about yourself.');
  await architectPage.getByRole('button', { name: 'Finished Editing' }).click();
  await expect(
    form.getByText('Add at least one field to this form.'),
  ).toBeVisible();
  // The refused save lists the problem, and its link returns to the form.
  const issue = architectPage
    .getByTestId('issue')
    .filter({ hasText: 'Form content - Add at least one field to this form.' });
  await expect(issue).toHaveCount(1);
  await issue.getByRole('link').click();
  await expect(formContent(form)).toBeFocused();
  await expect(architectPage).toHaveURL(/\/protocol\/stage\//);

  // A field put in now has problems of its own until its question is
  // typed; the list of problems waits for the next save, and leaves the
  // keyboard in the new field.
  await addFormField(form, {
    variableName: 'nickname',
    promptText: 'What do your friends call you?',
  });
  await expect(architectPage.getByTestId('issue')).toHaveCount(0);
  await editor.expectNoIssues();
  await editor.save();
});

test('a refused save names the field whose question is missing, and goes to it', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('EgoForm');
  await editor.setStageName('About You');
  const form = editor.section('Form');

  await formContent(form).click();
  await architectPage.keyboard.type('Tell us about yourself.');
  await addFormField(form, {
    variableName: 'nickname',
    promptText: 'What do your friends call you?',
  });
  // A second field, on an attribute of its own, whose question is left out.
  await focusFormEnd(form);
  await form.getByRole('button', { name: 'Field', exact: true }).click();
  const picker = architectPage.getByRole('dialog', {
    name: 'Attribute of the new field',
    exact: true,
  });
  await picker
    .getByRole('combobox', { name: 'Find or create an attribute' })
    .fill('age');
  await picker.getByRole('option', { name: 'Create “age”' }).click();
  await picker.getByRole('button', { name: /^Number\b/ }).click();
  await expect(picker).toBeHidden();
  await expect(fieldBlocks(form)).toHaveCount(2);

  await architectPage.getByRole('button', { name: 'Finished Editing' }).click();
  // Named as the editor names the field, by its attribute.
  const issue = architectPage
    .getByTestId('issue')
    .filter({ hasText: /^Field “age” - / });
  await expect(issue).toHaveCount(1);
  // The field's block has no id to link to: the row is a button.
  await issue.getByRole('button').click();
  const age = fieldBlocks(form).nth(1);
  await expect(age).toHaveAttribute('data-selected', /.*/);
  await expect(formContent(form)).toBeFocused();
});

test('a field on a new attribute with options is selected by a click on its control', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('EgoForm');
  await editor.setStageName('About You');
  const form = editor.section('Form');

  // The protocol has asked the participant nothing yet: the first
  // attribute, of a type with options, is made in the codebook's editor.
  await formContent(form).click();
  await architectPage.keyboard.type('Tell us about yourself.');
  await addFormField(form, {
    variableName: 'mood',
    promptText: 'How do you feel?',
    inputControl: 'Checkbox Group',
    author: authorOptions([
      { label: 'Happy', value: 'happy' },
      { label: 'Sad', value: 'sad' },
    ]),
  });

  // The control is a picture that takes no click of its own: a click on
  // it selects the field, and its settings open.
  const mood = fieldBlock(form, 'How do you feel?');
  const control = await mood.locator('[data-field-control]').boundingBox();
  if (control === null) throw new Error('The field shows no control.');
  await architectPage.mouse.click(
    control.x + control.width / 2,
    control.y + control.height / 2,
  );
  await expect(mood).toHaveAttribute('data-selected', /.*/);
  const settings = architectPage.getByRole('dialog', {
    name: 'Field settings',
    exact: true,
  });
  await expect(
    settings.getByRole('combobox', { name: 'Input control' }),
  ).toContainText('Checkbox Group');
  await closeFieldSettings(form, settings);

  await editor.expectNoIssues();
  await editor.save();
  const egoVariables = (protocol: CurrentProtocol) =>
    Object.values(protocol.codebook.ego?.variables ?? {});
  const protocol = await readProtocolJson(architectPage, (saved) =>
    egoVariables(saved).some((variable) => variable.name === 'mood'),
  );
  expect(
    egoVariables(protocol).find((variable) => variable.name === 'mood'),
  ).toMatchObject({
    type: 'categorical',
    options: [
      { label: { en: 'Happy' }, value: 'happy' },
      { label: { en: 'Sad' }, value: 'sad' },
    ],
  });
});

test('a field’s settings change its attribute’s control, and delete the field', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('EgoForm');
  await editor.setStageName('About You');
  const form = editor.section('Form');

  await formContent(form).click();
  await architectPage.keyboard.type('Tell us about yourself.');
  await addFormField(form, {
    variableName: 'nickname',
    promptText: 'What do your friends call you?',
  });
  await addFormField(form, {
    variableName: 'story',
    promptText: 'Tell us a story.',
    inputControl: 'Text Area',
  });
  await expect(fieldBlocks(form)).toHaveCount(2);

  // The control is the attribute's, and changes with it.
  const settings = await openFieldSettings(form, 'Tell us a story.');
  await expect(
    settings.getByRole('combobox', { name: 'Input control' }),
  ).toContainText('Text Area');
  await expect(settings).toContainText(
    'Changes here apply to every form that uses it.',
  );
  // The list of controls opens over the settings, and Escape closes it
  // without closing them.
  const control = settings.getByRole('combobox', { name: 'Input control' });
  await control.click();
  const options = architectPage.getByRole('option');
  await expect(options.first()).toBeVisible();
  for (const option of await options.all()) {
    expect(
      await option.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const under = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return element.contains(under);
      }),
      await option.innerText(),
    ).toBe(true);
  }
  await architectPage.keyboard.press('Escape');
  await expect(architectPage.getByRole('listbox')).toBeHidden();
  await expect(settings).toBeVisible();
  await expect(control).toBeFocused();
  // A second Escape leaves the settings for the field, which stays selected
  // with its settings beside it, as a file's block does; Enter goes back in.
  await architectPage.keyboard.press('Escape');
  await expect(formContent(form)).toBeFocused();
  await expect(fieldBlock(form, 'Tell us a story.')).toHaveAttribute(
    'data-selected',
    /.*/,
  );
  await expect(settings).toBeVisible();
  await architectPage.keyboard.press('Enter');
  await expect(settings.locator(':focus')).toHaveCount(1);
  await closeFieldSettings(form, settings);

  // Deleted from its settings, the field leaves the text and the form.
  const nickname = await openFieldSettings(
    form,
    'What do your friends call you?',
  );
  await nickname.getByRole('button', { name: 'Delete field' }).click();
  await expect(nickname).toBeHidden();
  await expect(fieldBlocks(form)).toHaveCount(1);

  // The caret is still the researcher's: the text goes on below the field.
  await focusFormEnd(form);
  await architectPage.keyboard.type('Thank you.');

  await editor.expectNoIssues();
  await editor.save();

  const protocol = await readProtocolJson(architectPage);
  const stage = protocol.stages[0];
  if (stage?.type !== 'EgoForm') throw new Error('expected an Ego Form');
  expect(stage.form.fields).toHaveLength(1);
  const [field] = stage.form.fields;
  expect(field?.prompt).toEqual({ en: 'Tell us a story.' });
  expect(stage.form.content).toEqual({
    en: [
      'Tell us about yourself.',
      fieldBlockMarkdown(field?.id ?? ''),
      'Thank you.',
    ].join('\n\n'),
  });
  const variables = Object.values(protocol.codebook.ego?.variables ?? {});
  expect(variables.find((variable) => variable.name === 'story')).toMatchObject(
    { type: 'text', component: 'TextArea' },
  );
});
