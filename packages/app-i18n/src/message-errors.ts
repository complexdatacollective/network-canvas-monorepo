// A server entry for code that has no React and no reader: it declares the
// messages its refusals name and encodes them into a string-only result
// contract, and a client formats them in the reader's language. Nothing here
// imports react-intl at run time, so a server bundle that takes this entry
// does not take React with it.
import type { DefineMessages } from './messages.ts';

/**
 * The same helper as `@codaco/app-i18n/messages`' `defineMessages`, without
 * the react-intl binding: it returns its argument. Extraction finds the call by
 * its name, so messages declared here reach the catalog of the app that
 * formats them like any other.
 */
export const defineMessages: DefineMessages = (messages) => messages;

export { createMessageError, formatMessageError } from './messageErrors.ts';
export type { MessageErrorValues } from './messageErrors.ts';
