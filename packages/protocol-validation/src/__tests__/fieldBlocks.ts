import {
  fieldIdsIn,
  readContentDocument,
} from '../localization/contentDocument.ts';
import {
  fieldBlockMarkdown,
  renameFieldBlocks,
} from '../localization/fieldBlock.ts';

/** The id that `withFieldIdsHidden` gives every field block. */
const HIDDEN_FIELD_ID = 'field';

/** A field block as `withFieldIdsHidden` writes it. */
export const HIDDEN_FIELD_BLOCK = fieldBlockMarkdown(HIDDEN_FIELD_ID);

/**
 * `message` with every field block that its document places naming one
 * stand-in id (`HIDDEN_FIELD_BLOCK`): for comparing a migrated form's
 * document with a fixture, when the migration gives each field an id of its
 * own choosing. The blocks are found by reading the document
 * (`readContentDocument`), not by matching their text.
 */
export const withFieldIdsHidden = (message: string): string => {
  const ids = fieldIdsIn(readContentDocument(message).nodes);
  return renameFieldBlocks(
    message,
    new Map(ids.map((id) => [id, HIDDEN_FIELD_ID])),
  );
};
