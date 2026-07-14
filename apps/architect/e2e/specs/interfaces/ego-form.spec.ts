import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { addFormField } from '../../pageobjects/editor-sections/forms.js';
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

  // IntroductionPanel.tsx's `introductionPanel.title` field renders through
  // `component={FrescoReduxField}`, so `data-field-name="introductionPanel.title"`
  // (Task 2's seam) is the reliable locator — matching Task 14's Title.tsx
  // pattern rather than the accessible name (which happens to be "Title"
  // here too, since `ValidatedField`'s own `label="Title"` prop wins).
  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('About You');

  // IntroductionPanel.tsx passes `componentProps={{ label: 'Introduction text' }}`
  // to its RichText field. That explicit `label` wins over RichTextField's
  // `label ?? input.name` fallback, so the rendered control's accessible name
  // (wired via fresco-ui's UnconnectedField `aria-labelledby` -> a real
  // `<label>`) is the literal string "Introduction text" — NOT the field's
  // redux-form name `introductionPanel.text`. Confirmed against
  // IntroductionPanel.tsx / RichText/Field.tsx / UnconnectedField.tsx source,
  // not guessed.
  await editor.fillRichText(
    'Introduction text',
    'Thanks for taking part in this study.',
  );

  // EgoForm's subject always defaults to `{ entity: 'ego', type: null }`
  // (enhancers/withSubject.tsx's `defaultSubject`), and
  // `withDisabledSubjectRequired` only disables the Form section when
  // `interfaceType !== 'EgoForm' && !type` (enhancers/withDisabledSubjectRequired.tsx)
  // — so, unlike AlterForm/AlterEdgeForm, no subject-selection step is needed
  // before this section is interactive.
  await addFormField(editor.section('Form'), {
    variableName: 'age',
    promptText: 'What is your name?',
    inputControl: 'Text Input',
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('EgoForm');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot('ego-form-stage.json');
});
