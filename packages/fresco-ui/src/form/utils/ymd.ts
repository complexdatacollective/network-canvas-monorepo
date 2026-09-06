// The UTC day-stamp the date fields default an undeclared bound to. It lives
// in `@codaco/shared-consts`, beside the windows built from it, because the
// packages that have to predict what these controls will accept — the
// interview runtime and the protocol builder — must be able to read it without
// depending on a UI package. Re-exported here so the subpath external
// consumers already import stays where it was, and so there is one
// implementation rather than two that could drift a day apart.
export { todayYmd } from '@codaco/shared-consts';
