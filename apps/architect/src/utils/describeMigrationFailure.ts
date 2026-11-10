import {
  type IntlShape,
  createAppIntl,
  createMessageError,
  defineMessages,
} from '@codaco/app-i18n/messages';
import {
  DUPLICATE_LABEL,
  MigrationResultInvalidError,
  STAGE_LABEL_TOO_LONG,
} from '@codaco/protocol-validation';

const utilityMessages = defineMessages({
  twoAttributesShareAName: {
    id: 'architect.utility.utils.describeMigrationFailure.twoAttributesShareAName',
    defaultMessage: 'Two attributes share a name',
    description: 'The title text in utils / describeMigrationFailure.',
  },
  thatWasAllowedWhen: {
    id: 'architect.utility.utils.describeMigrationFailure.thatWasAllowedWhen',
    defaultMessage:
      '{location, select, ego {Two attributes on the interviewee are both named "{name}".} named {Two attributes on "{ownerLabel}" are both named "{name}".} other {Two attributes are both named "{name}".}} That was allowed when this protocol was made, but they cannot both exist now — a researcher reading a dropdown could not tell them apart. Open this protocol in the version of Architect that created it, rename one of them, then open it here again.',
    description: 'The message text in utils / describeMigrationFailure.',
  },
  twoOptionsHaveTheSameLabel: {
    id: 'architect.utility.utils.describeMigrationFailure.twoOptionsHaveTheSameLabel',
    defaultMessage: 'Two options have the same label',
    description:
      'Title of the dialog shown when Architect cannot open a protocol made with an older version because two answer options of one attribute have the same label: a participant would see the same text, perhaps differing only in capital letters or spaces at either end.',
  },
  optionsHaveTheSameLabelWhenMade: {
    id: 'architect.utility.utils.describeMigrationFailure.optionsHaveTheSameLabelWhenMade',
    defaultMessage:
      'Options {first, number} and {second, number} of the attribute “{attribute}” have the same label: “{firstLabel}” and “{secondLabel}”. That was allowed when this protocol was made, but participants could not tell them apart. Open this protocol in the version of Architect that created it, give the options different labels, then open it here again.',
    description:
      'Shown when Architect cannot open a protocol made with an older version because two answer options of one attribute (a question in the codebook with a fixed list of answers) have the same label as a participant would see it: written the same, or differing only in capital letters or spaces at either end. first and second are the options’ positions in the list, counting from 1. attribute is the attribute’s name. firstLabel and secondLabel are the two labels. Architect does not change the labels itself: the researcher changes them in the older Architect.',
  },
  stageNameTooLong: {
    id: 'architect.utility.utils.describeMigrationFailure.stageNameTooLong',
    defaultMessage: 'A stage name is too long',
    description:
      'Title of the dialog shown when Architect cannot open a protocol made with an older version because a stage’s name is longer than a stage name may now be.',
  },
  stageNameTooLongWhenMade: {
    id: 'architect.utility.utils.describeMigrationFailure.stageNameTooLongWhenMade',
    defaultMessage:
      'The stage name “{name}” is longer than {max, number} characters. That was allowed when this protocol was made, but a longer name does not fit where stage names are shown. Open this protocol in the version of Architect that created it, shorten the name, then open it here again.',
    description:
      'Shown when Architect cannot open a protocol made with an older version because a stage’s name is longer than a stage name may now be. name is the stage’s name. max is the most characters a stage name may have. Architect does not shorten the name itself: the researcher does, in the older Architect.',
  },
  failedToOpenProtocol: {
    id: 'architect.utility.utils.describeMigrationFailure.failedToOpenProtocol',
    defaultMessage: 'Failed to Open Protocol',
    description: 'The title text in utils / describeMigrationFailure.',
  },
  thisProtocolCouldNotBeBrought: {
    id: 'architect.utility.utils.describeMigrationFailure.thisProtocolCouldNotBeBrought',
    defaultMessage:
      'This protocol could not be brought up to date. Open it in the version of Architect that created it, check its settings, and try again.',
    description: 'The message text in utils / describeMigrationFailure.',
  },
});

const defaultIntl = createAppIntl({ locale: 'en' });
/**
 * Turns a thrown migration failure into something a researcher can act on.
 *
 * `migrateProtocol` re-validates its output and throws when the result does not
 * satisfy the current schema. Architect surfaced that as a bare "Protocol
 * migration failed.", which tells the researcher nothing about their file and
 * offers no way forward — their instrument simply will not open.
 *
 * The case worth naming specifically is the duplicate attribute name. Schema 8
 * compares codebook names case-insensitively and in Unicode canonical form, so
 * a protocol authored under an older Architect may legitimately hold `name` and
 * `NAME` on one entity: two distinct variables, each with its own collected
 * data and its own export column. That is why this is reported rather than
 * repaired — which of the pair keeps the name changes an export header for data
 * already gathered, and only the researcher can make that call.
 *
 * DELIBERATELY NOT A REPAIR. Renaming automatically is technically safe
 * (everything references variables by id), but it would silently rewrite a
 * column heading in data already collected. The researcher is told exactly what
 * collides and where, and fixes it in the version of Architect that wrote it.
 */

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const DUPLICATE_NAME = /Duplicate attribute name "([^"]+)"/;

/**
 * How many attributes on `owner` carry exactly this name.
 *
 * EXACT, because that is how the schema compares them (`findDuplicateName` in
 * `@codaco/protocol-validation`, which documents why it does not fold). A
 * describer that folded would point the researcher at entries the schema never
 * objected to — `GENDER` named alongside a genuine `Gender`/`Gender` pair —
 * and this message exists to tell them which entries to go and look at.
 */
const countNamed = (owner: unknown, name: string): number => {
  const variables = isRecord(owner) ? owner.variables : undefined;
  if (!isRecord(variables)) return 0;

  let found = 0;
  for (const variable of Object.values(variables)) {
    const candidate = isRecord(variable) ? variable.name : undefined;
    if (candidate === name) found += 1;
  }
  return found;
};

/** Where in the codebook the repeated name lives, phrased for a researcher. */
const locateCollision = (
  protocol: unknown,
  name: string,
): { location: 'ego' | 'named'; ownerLabel?: string } | undefined => {
  const codebook = isRecord(protocol) ? protocol.codebook : undefined;
  if (!isRecord(codebook)) return undefined;

  if (countNamed(codebook.ego, name) > 1) return { location: 'ego' };

  for (const entity of ['node', 'edge'] as const) {
    const types = codebook[entity];
    if (!isRecord(types)) continue;
    for (const type of Object.values(types)) {
      if (countNamed(type, name) > 1) {
        const label =
          isRecord(type) && typeof type.name === 'string' ? type.name : entity;
        return { location: 'named', ownerLabel: label };
      }
    }
  }
  return undefined;
};

/**
 * A researcher-facing title and message for a migration that threw.
 *
 * Unknown failures receive complete actionable guidance. The original reason
 * is retained separately for the labelled technical disclosure.
 */
/**
 * A refusal of something the protocol holds that its version allowed and the
 * current one does not, which Architect leaves to the researcher to change:
 * two options with the same label, or a stage name too long to show. Read from
 * the refused result's own issues (`MigrationResultInvalidError`), which carry
 * what the sentence names.
 */
const describeRefusedContent = (
  error: Error,
): { title: string; message: string } | undefined => {
  if (!(error instanceof MigrationResultInvalidError)) return undefined;
  for (const { code, params } of error.issues) {
    if (params === undefined) continue;
    const text = (key: string) => {
      const value = params[key];
      return typeof value === 'string' || typeof value === 'number'
        ? value
        : '';
    };
    if (code === DUPLICATE_LABEL && params.kind === 'option') {
      return {
        title: createMessageError(utilityMessages.twoOptionsHaveTheSameLabel),
        message: createMessageError(
          utilityMessages.optionsHaveTheSameLabelWhenMade,
          {
            first: text('first'),
            second: text('second'),
            attribute: text('name'),
            firstLabel: text('firstLabel'),
            secondLabel: text('secondLabel'),
          },
        ),
      };
    }
    if (params.rule === STAGE_LABEL_TOO_LONG) {
      return {
        title: createMessageError(utilityMessages.stageNameTooLong),
        message: createMessageError(utilityMessages.stageNameTooLongWhenMade, {
          name: text('text'),
          max: text('max'),
        }),
      };
    }
  }
  return undefined;
};

export const describeMigrationFailure = (
  error: Error,
  protocol: unknown,
  _intl: IntlShape = defaultIntl,
): { title: string; message: string; detail?: string } => {
  const refused = describeRefusedContent(error);
  if (refused !== undefined) return { ...refused, detail: error.message };

  const duplicate = DUPLICATE_NAME.exec(error.message);

  if (duplicate?.[1]) {
    const name = duplicate[1];
    const where = locateCollision(protocol, name);
    return {
      title: createMessageError(utilityMessages.twoAttributesShareAName),
      message: createMessageError(utilityMessages.thatWasAllowedWhen, {
        location: where?.location ?? 'unknown',
        ownerLabel: where?.ownerLabel ?? '',
        name,
      }),
      detail: error.message,
    };
  }

  return {
    title: createMessageError(utilityMessages.failedToOpenProtocol),
    message: createMessageError(utilityMessages.thisProtocolCouldNotBeBrought),
    detail: error.message,
  };
};
