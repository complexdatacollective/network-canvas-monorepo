import { messages } from './messages';

// Rendered copy only. BIOLOGICAL_SEX_OPTIONS in the schema owns stored values.
export const BIOLOGICAL_SEX_QUESTION = {
  self: messages.sexSelf,
  other: messages.sexOther,
};
export const BIOLOGICAL_SEX_HINT = messages.sexHint;
export const BIOLOGICAL_SEX_LEAD_IN = messages.sexLeadIn;
export const biologicalSexMessages = {
  female: messages.sexFemale,
  male: messages.sexMale,
  intersex: messages.sexIntersex,
  unknown: messages.sexUnknown,
  preferNotToSay: messages.sexPreferNotToSay,
};
