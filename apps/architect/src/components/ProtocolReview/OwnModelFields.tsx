import { useEffect, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAppSelector } from '~/ducks/hooks';
import {
  completeOwnModelSettings,
  isOwnModelAddress,
  OWN_MODEL_LIMITS,
  type OwnModelErrorCode,
  type OwnModelSettings,
} from '~/protocolReview/ownModel';
import { testOwnModel } from '~/protocolReview/ownModelClient';

import { formatOwnModelFailure } from './ownModelText';
import { textOf, useFocusFirstErrorOnRefusal } from './wizardFields';

const messages = defineMessages({
  privacy: {
    id: 'architect.protocolReview.ownModel.privacy',
    defaultMessage:
      'Your protocol and study details are sent straight from this browser to the address you give here, and nowhere else. They do not pass through the Network Canvas service, and this review is not shared with the Network Canvas team. The address, model name and API key are kept in this browser only.',
    description:
      'Note shown when the researcher chooses to have their own model write the automated protocol review. "Network Canvas" is a product name and is not translated. An API key is a credential.',
  },
  addressLabel: {
    id: 'architect.protocolReview.ownModel.addressLabel',
    defaultMessage: 'Endpoint address',
    description:
      'Label of the text box for the web address of the researcher’s own model server. An endpoint is the web address a model server answers at.',
  },
  addressHint: {
    id: 'architect.protocolReview.ownModel.addressHint',
    defaultMessage:
      'The base address of an OpenAI-compatible API, such as {ollama} for Ollama or {lmStudio} for LM Studio.',
    description:
      'Hint under the Endpoint address label. "OpenAI-compatible API" is a technical term; "OpenAI" is a company name and is not translated. "Ollama" and "LM Studio" are names of programs and are not translated. {ollama} and {lmStudio} are example web addresses.',
  },
  addressRequired: {
    id: 'architect.protocolReview.ownModel.addressRequired',
    defaultMessage: 'Enter the address of your endpoint.',
    description:
      'Error under an empty Endpoint address box when the researcher tries to continue.',
  },
  addressInvalid: {
    id: 'architect.protocolReview.ownModel.addressInvalid',
    defaultMessage:
      'Enter an address that starts with {https}, or with {localhost} for a model on this computer.',
    description:
      'Error under the Endpoint address box when what was typed is not an address Architect can call. {https} is "https://" and {localhost} is "http://localhost".',
  },
  nameLabel: {
    id: 'architect.protocolReview.ownModel.nameLabel',
    defaultMessage: 'Model name',
    description:
      'Label of the text box for the name of the model on the researcher’s own model server.',
  },
  nameHint: {
    id: 'architect.protocolReview.ownModel.nameHint',
    defaultMessage: 'The name of the model, exactly as your endpoint lists it.',
    description: 'Hint under the Model name label.',
  },
  nameRequired: {
    id: 'architect.protocolReview.ownModel.nameRequired',
    defaultMessage: 'Enter the name of the model.',
    description:
      'Error under an empty Model name box when the researcher tries to continue.',
  },
  keyLabel: {
    id: 'architect.protocolReview.ownModel.keyLabel',
    defaultMessage: 'API key (optional)',
    description:
      'Label of the text box for the API key of the researcher’s own model server. An API key is a credential; many model servers need none.',
  },
  keyHint: {
    id: 'architect.protocolReview.ownModel.keyHint',
    defaultMessage:
      'Only if your endpoint needs one. A model running on your own computer usually does not.',
    description: 'Hint under the API key label.',
  },
  test: {
    id: 'architect.protocolReview.ownModel.test',
    defaultMessage: 'Test connection',
    description:
      'Button that checks whether Architect can reach the researcher’s own model server with the address, model name and API key entered.',
  },
  testing: {
    id: 'architect.protocolReview.ownModel.testing',
    defaultMessage: 'Testing the connection…',
    description:
      'Status shown while Architect checks whether it can reach the researcher’s own model server.',
  },
  testOk: {
    id: 'architect.protocolReview.ownModel.testOk',
    defaultMessage: 'Connected. The model answered.',
    description:
      'Status shown when the connection test reached the researcher’s own model server and the model answered.',
  },
});

const OWN_ADDRESS = 'ownModelAddress';
const OWN_MODEL_NAME = 'ownModelName';
const OWN_KEY = 'ownModelKey';

/**
 * The endpoint the fields hold, read out of the wizard's data or the form's
 * values; null while they do not make settings a review can be sent with.
 */
export const readOwnModelFields = (
  values: Record<string, unknown>,
): OwnModelSettings | null =>
  completeOwnModelSettings({
    address: values[OWN_ADDRESS],
    model: values[OWN_MODEL_NAME],
    apiKey: values[OWN_KEY],
  });

/** Example addresses, shown as they are in every language. */
const OLLAMA_ADDRESS = 'http://localhost:11434/v1';
const LM_STUDIO_ADDRESS = 'http://localhost:1234/v1';

type ConnectionTest =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok' }
  | { status: 'failed'; code: OwnModelErrorCode };

/**
 * The researcher's own model endpoint: where it is, which model, and its key
 * if it needs one, with a test that asks it for one word. Shown while "Your
 * own model" is the choice, so its fields are required only then.
 */
export default function OwnModelFields() {
  const intl = useAppIntl();
  const { data } = useWizard();
  const saved = useAppSelector((state) => state.protocolReview.ownModel);
  const root = useRef<HTMLDivElement>(null);
  useFocusFirstErrorOnRefusal(root);

  const values = useFormValue([OWN_ADDRESS, OWN_MODEL_NAME, OWN_KEY]);
  const settings = readOwnModelFields(values);

  // An answer is about the settings it was asked with: it is kept with them,
  // and shown only while they are still what the fields hold.
  const current =
    settings === null
      ? null
      : `${settings.address}\n${settings.model}\n${settings.apiKey}`;
  const [answer, setAnswer] = useState<{
    asked: string;
    test: ConnectionTest;
  } | null>(null);
  const test: ConnectionTest =
    answer !== null && answer.asked === current
      ? answer.test
      : { status: 'idle' };
  const testing = useRef<AbortController | null>(null);
  // A test still out when the step closes answers nobody.
  useEffect(() => () => testing.current?.abort(), []);

  const runTest = async () => {
    if (settings === null || current === null) return;
    testing.current?.abort();
    const controller = new AbortController();
    testing.current = controller;
    setAnswer({ asked: current, test: { status: 'testing' } });
    const result = await testOwnModel({ settings, signal: controller.signal });
    if (testing.current !== controller) return;
    testing.current = null;
    if (result.ok) {
      setAnswer({ asked: current, test: { status: 'ok' } });
    } else if (result.code === 'aborted') {
      setAnswer(null);
    } else {
      setAnswer({
        asked: current,
        test: { status: 'failed', code: result.code },
      });
    }
  };

  const failure =
    test.status === 'failed' ? formatOwnModelFailure(intl, test.code) : null;

  return (
    <div ref={root} className="flex flex-col gap-4">
      <Paragraph intent="smallText" margin="none" className="max-w-[65ch]">
        {intl.formatMessage(messages.privacy)}
      </Paragraph>
      <Field
        name={OWN_ADDRESS}
        label={intl.formatMessage(messages.addressLabel)}
        hint={intl.formatMessage(messages.addressHint, {
          ollama: OLLAMA_ADDRESS,
          lmStudio: LM_STUDIO_ADDRESS,
        })}
        component={InputField}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        // An address is left to right in every language.
        dir="ltr"
        initialValue={textOf(data[OWN_ADDRESS], saved?.address ?? '')}
        required={intl.formatMessage(messages.addressRequired)}
        maxLength={OWN_MODEL_LIMITS.address}
        custom={messageRuleValidation([
          (value) =>
            typeof value !== 'string' ||
            value.trim() === '' ||
            isOwnModelAddress(value)
              ? undefined
              : intl.formatMessage(messages.addressInvalid, {
                  https: 'https://',
                  localhost: 'http://localhost',
                }),
        ])}
      />
      <Field
        name={OWN_MODEL_NAME}
        label={intl.formatMessage(messages.nameLabel)}
        hint={intl.formatMessage(messages.nameHint)}
        component={InputField}
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        initialValue={textOf(data[OWN_MODEL_NAME], saved?.model ?? '')}
        required={intl.formatMessage(messages.nameRequired)}
        maxLength={OWN_MODEL_LIMITS.model}
      />
      <Field
        name={OWN_KEY}
        label={intl.formatMessage(messages.keyLabel)}
        hint={intl.formatMessage(messages.keyHint)}
        component={PasswordField}
        // A key for a model server is not a website password: it is kept
        // out of the browser's password manager.
        suppressPasswordManager
        placeholder=""
        autoComplete="off"
        initialValue={textOf(data[OWN_KEY], saved?.apiKey ?? '')}
        maxLength={OWN_MODEL_LIMITS.apiKey}
      />
      <div className="flex flex-col gap-2">
        <div>
          <Button
            onClick={() => void runTest()}
            disabled={settings === null || test.status === 'testing'}
          >
            {intl.formatMessage(messages.test)}
          </Button>
        </div>
        {test.status === 'testing' && (
          <Paragraph margin="none" role="status" className="text-sm">
            {intl.formatMessage(messages.testing)}
          </Paragraph>
        )}
        {test.status === 'ok' && (
          <Alert variant="success" density="compact" className="my-0">
            <AlertDescription>
              {intl.formatMessage(messages.testOk)}
            </AlertDescription>
          </Alert>
        )}
        {failure !== null && (
          <Alert variant="warning" density="compact" className="my-0">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <AlertTitle>{failure.title}</AlertTitle>
              <AlertDescription className="text-sm">
                {failure.body}
              </AlertDescription>
            </div>
          </Alert>
        )}
      </div>
    </div>
  );
}
