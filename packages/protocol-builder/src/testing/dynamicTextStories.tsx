import Field from '@codaco/fresco-ui/form/Field/Field';
import {
  dynamicValueNameFor,
  informationStage,
} from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import DynamicTextField from '../fields/DynamicTextField.tsx';
import { markdownTextShapeAt } from '../localization/textShape.ts';
import type { InMemoryHost } from './host/createInMemoryHost.ts';
import { fixtureStageId } from './protocolFixture.ts';
import { testId } from './testId.ts';

/**
 * What the stories of the researcher's text editor share: an Information
 * stage's page, and a page that contains a dynamic attribute and a logic
 * block, both about whether the participant gave their name.
 */

export const INFORMATION_STAGE = fixtureStageId('information-1');

export const CONTENT_LABEL = 'Page content';

/** An Information stage's page: text of several lines. */
export const pageContentField = (
  <Field<typeof DynamicTextField>
    name="content"
    component={DynamicTextField}
    label={CONTENT_LABEL}
    dynamicValues="stageText"
    shape={markdownTextShapeAt(informationStage, ['content'])}
  />
);

/** The fixture's one ego attribute: the participant's name. */
const EGO_NAME = '63dd79a3-4154-52ad-b515-fb3cc8d24811';

const NAME_GIVEN = testId('story/condition/name-given');
const GREETING = testId('story/dynamic/greeting');

/** The name a dynamic attribute has in the text. */
export const GREETING_NAME = dynamicValueNameFor({
  kind: 'dynamicAttribute',
  id: GREETING,
});

const NAME_GIVEN_NAME = dynamicValueNameFor({
  kind: 'condition',
  conditionId: NAME_GIVEN,
});

/** The wording of the dynamic attribute when its rules are met. */
export const GREETING_WHEN_MET = 'welcome back';

/** The content of the logic block that is shown when its rules are met. */
export const SHOWN_WHEN_MET = 'Thank you for telling us your name.';

/** The page's text, as it is stored. */
export const pageText = [
  '# Welcome',
  '',
  `We say {${GREETING_NAME}}. Today is {now}.`,
  '',
  `{${NAME_GIVEN_NAME}, select, true {${SHOWN_WHEN_MET}} other {Please tell us your name.}}`,
].join('\n');

/**
 * The Information stage with the page above: its condition, and its dynamic
 * attribute, which reads “welcome back” once the participant gave their name.
 */
export const seedPageWithLogic = (host: InMemoryHost) => {
  const page = sectionId({ kind: 'stage', stageId: INFORMATION_STAGE });
  host.store.applyAsCollaborator(page, {
    ...host.store.read(page).document,
    content: { 'en-US': pageText },
    conditions: {
      [NAME_GIVEN]: {
        rules: [
          {
            id: testId('story/rule/name-given'),
            type: 'ego',
            options: { attribute: EGO_NAME, operator: 'EXISTS' },
          },
        ],
      },
    },
    dynamicAttributes: {
      [GREETING]: {
        logic: 'conditions',
        cases: [
          {
            condition: NAME_GIVEN,
            when: 'met',
            wording: { 'en-US': GREETING_WHEN_MET },
          },
        ],
        otherwise: { 'en-US': 'welcome' },
      },
    },
  });
};
