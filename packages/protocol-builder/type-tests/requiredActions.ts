import type {
  StageEditorComponent,
  StageEditorProps,
} from '../src/stage-editor-contract.ts';

/**
 * MUST NOT COMPILE: an editor that insists on the host's action chrome.
 *
 * The dispatcher renders an editor with whatever a host gave it, and a host
 * showing a spectator view gives it nothing. An editor whose `actions` were
 * required would be rendered without them anyway, and its own code would then
 * call a slot that is not there — so the registry has to refuse it here, where
 * the family that wrote it is looking.
 */
type InsistsOnChrome = Omit<StageEditorProps<'Information'>, 'actions'> &
  Readonly<{
    actions: NonNullable<StageEditorProps<'Information'>['actions']>;
  }>;

export const InsistentEditor: StageEditorComponent<'Information'> = (
  _props: InsistsOnChrome,
) => null;
