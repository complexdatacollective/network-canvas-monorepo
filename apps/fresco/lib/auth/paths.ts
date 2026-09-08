/**
 * Where an account that must set up mandatory two-factor authentication is
 * sent. Shared by the server guards that redirect there and the client sign-in
 * form that navigates there, so the two can never disagree.
 */
export const TWO_FACTOR_SETUP_PATH = '/signin/two-factor-setup';
