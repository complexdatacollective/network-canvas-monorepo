import { STAGE_FORM_ID } from './stageFormId';

let destination: string | null = null;

// A save the researcher asks for themselves goes to the stage list.
const forgetOnOwnSubmit = (event: SubmitEvent) => {
  if (event.submitter !== null) destination = null;
};

/** Saves the stage as Finished Editing does, then goes to `href` instead of the stage list. */
export const saveStageAndGoTo = (href: string) => {
  const form = document.getElementById(STAGE_FORM_ID);
  if (!(form instanceof HTMLFormElement)) return;
  form.addEventListener('submit', forgetOnOwnSubmit);
  destination = href;
  form.requestSubmit();
};

/** Where the save asked for by `saveStageAndGoTo` goes, read once. */
export const takeSaveDestination = () => {
  const next = destination;
  destination = null;
  return next;
};

export const clearSaveDestination = () => {
  destination = null;
};
