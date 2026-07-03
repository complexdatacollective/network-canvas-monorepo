# interviewer-v8 Storybook stories — design

**Date:** 2026-07-03
**App:** `apps/interviewer-v8` (`@codaco/interviewer-v8`)
**Status:** Approved for planning

## Goal

Give `interviewer-v8`'s unique components Storybook coverage, **authentication/authorisation
components first**, then the remaining unique components. Where a component is bound to app
context (`useAuth`, `useWizard`, `authApi`, `useToast`, `useDialog`), refactor it into a pure,
prop-driven presentational component plus a thin container, so the presentational surface can be
rendered in isolation. Stories follow a single args-driven default per component rather than many
preset stories.

## Non-goals

- **No Storybook infrastructure work.** It already exists: `.storybook/{main.ts,preview.tsx,preview.css,Providers.tsx}`,
  the `storybook` / `build-storybook` / `test:storybook` / `chromatic` scripts, catalog devDeps,
  the vitest `storybook` browser-mode project, and the turbo `storybook` / `build-storybook` tasks.
- **No CI / Chromatic wiring.** There is no `chromatic-interviewer-v8` job today; adding one is
  explicitly out of scope for this change (deferred to a separate change; would need a
  `CHROMATIC_PROJECT_TOKEN_INTERVIEWER_V8` secret).
- **No changeset.** interviewer-v8 is unreleased.
- **No runtime behaviour change** to the vault / auth flows. The container/view splits are
  behaviour-preserving and remain guarded by the existing unit tests.

## Why a presentational/container split (not mocks)

The existing unit tests isolate auth components with `vi.mock('~/lib/auth/AuthContext')`. **Storybook
renders in a real browser and cannot `vi.mock` modules**, so the same trick is unavailable. The two
realistic options are (a) inject a context value via a Storybook decorator, or (b) make the component
prop-driven. Option (b) is preferred because:

- It matches the requested "single default story driven by args" style — `mode`, `method`,
  outcomes, and flags become Storybook controls on a pure component.
- It is better code: e.g. `StepUpAuthDialog`'s inner forms currently call `authApi.verify*` inline;
  lifting those to props decouples the presentational layer from the vault API and makes it unit-testable
  without module mocks.
- It avoids constructing valid mock values for the `AuthContextValue` discriminated union
  (`AuthState & AuthActions`) in every story.

The only shared story infrastructure required is a **`FormStoreProvider` decorator** for stories whose
views contain connected `@codaco/fresco-ui` `Field`s (`FormStoreProvider` is a UI primitive, not app
context). No auth-context mock is expected.

### The split pattern

For a context-bound component `X`:

- **`XView`** — pure. All inputs are props: current state values plus callbacks. No `useAuth`,
  `useWizard`, `authApi`, `useToast`, or `useDialog`. Local UI-only state (e.g. a "show recovery"
  toggle, an "affirmed" checkbox) may stay inside the view when a story wants to drive it via a
  control; otherwise it is lifted to a prop.
- **`X`** — thin container, keeps the current exported name and behaviour, reads context/hooks, and
  renders `XView`. All existing call sites are unchanged.

`XView` is co-located in the same file as `X` (or a sibling), and is imported by both the container
and the story, so knip sees it as used.

## Story conventions

- **One args-driven default story per component**: `meta` carries `args` + `argTypes`; the single
  `export const Default: Story = {}` (or a descriptively named single story) renders from those args.
- **`argTypes`**: enums as `select` controls (auth `mode` = `biometric | pin | passphrase`, notice
  `method` = `pin | passphrase | biometric`, biometric availability); `loading` / `error` / `disabled`
  as `boolean`; free text (labels, messages) as `text`. Async result callbacks are driven by an
  `outcome: 'success' | 'error'` arg mapped to a stub that resolves `{ ok: true }` or
  `{ ok: false, message }`.
- **Named preset stories only where a control cannot reach the state** — e.g. a pinned error/loading
  snapshot, or a story carrying a `play()` interaction test.
- **Reuse the existing global `Providers` decorator** (Toast, Tooltip, Dialog, DnD, Direction, Motion)
  from `.storybook/preview.tsx`. Add the `FormStoreProvider` decorator per-story (or per-meta) where
  needed.
- **`play()` interaction tests** for the behaviours that matter: PIN auto-submit + clear-on-error,
  biometric → recovery-passphrase fallback toggle, affirmation gating of the enrolment step,
  method-picker availability messaging.

## Coverage

### Auth — already pure, story directly

| Component                                               | Path                                                 | Story                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `UnlockEmblem`                                          | `src/components/UnlockForms/UnlockEmblem.tsx`        | args: `icon`, `seed` (visual)                                                   |
| `AuthorisationGlyph` / `SecureDataGlyph` / `SetupGlyph` | `src/components/SetupWizard/*Glyph.tsx`              | one story each (pure SVG)                                                       |
| `NoRecoveryNotice`                                      | `src/components/SetupWizard/NoRecoveryNotice.tsx`    | args: `method`                                                                  |
| `SecurityBehaviorControls`                              | `src/components/SecurityBehaviorControls.tsx`        | args: the four settings flags + change handlers                                 |
| `BiometricUnlockForm`                                   | `src/components/UnlockForms/BiometricUnlockForm.tsx` | args: `outcome`, `submitLabel`, `disabled` + `play`                             |
| `PinUnlockField`                                        | `src/components/UnlockForms/PinUnlockField.tsx`      | args + `FormStoreProvider` decorator                                            |
| `PasswordUnlockField`                                   | `src/components/UnlockForms/PasswordUnlockField.tsx` | args (`autoFocus`) + `FormStoreProvider` decorator                              |
| `PinUnlockForm`                                         | `src/components/UnlockForms/PinUnlockForm.tsx`       | args (`verifyPin` outcome) + `play` (auto-submit / clear-on-error)              |
| `BiometricLockBody`                                     | `src/components/UnlockForms/BiometricLockBody.tsx`   | already callback-driven — args (`limited`, outcomes) + `play` (recovery toggle) |

### Auth — extract `XView`, then story the view

| Component                                                                         | Path                                                      | Refactor for the view                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LockScreen` → `LockScreenView`                                                   | `src/components/LockScreen.tsx`                           | View takes `mode` + `unlockWithPin/Passphrase/Biometric/Recovery`. Container keeps the `useAuth()` read + the `kind !== 'locked'` early return. Story `mode` = biometric / pin / passphrase.                                                                                                                                       |
| `StepUpAuthDialog` → `StepUpAuthDialogView`                                       | `src/lib/auth/StepUpAuthDialog.tsx`                       | Lift the inline `authApi.verify*` calls to props (`verifyWithPin`, `verifyWithPassphrase`, `verifyBiometric`, `verifyWithRecovery`); container binds them. Args: `mode`, `open`, `limited`, per-method `outcome`, `onResolve`, `onCancel`. `hasPasskeyWindowLimitation()` becomes the `limited` prop's container-supplied default. |
| `Step2MethodPicker` → `Step2MethodPickerView`                                     | `src/components/SetupWizard/Step2MethodPicker.tsx`        | View takes `value`, `onChange`, biometric availability `{ available, reason }`, `onConfirmNone`. Container keeps `useWizard` / `useBiometric` / `useDialog`.                                                                                                                                                                       |
| `Step3PinConfigure` → `…View`                                                     | `src/components/SetupWizard/Step3PinConfigure.tsx`        | View renders the two `SegmentedCodeField`s + `NoRecoveryNotice` + affirmation checkbox + error alert; props: `error`, `affirmed`, `onAffirmChange`. Container keeps `useWizard` + `useFormValue` + `authApi`. `FormStoreProvider` decorator in the story.                                                                          |
| `Step3PassphraseConfigure` → `…View`                                              | `src/components/SetupWizard/Step3PassphraseConfigure.tsx` | As above, plus strength meter; props: `error`, `affirmed`, `onAffirmChange`.                                                                                                                                                                                                                                                       |
| `Step3BiometricConfigure` → `…View`                                               | `src/components/SetupWizard/Step3BiometricConfigure.tsx`  | Recovery-passphrase fields + strength + alert; props: `error`, strength state.                                                                                                                                                                                                                                                     |
| `ManageAuthenticator` (`ChangePinForm`, `ChangePassphraseForm`, `ResetDeviceRow`) | `src/components/ManageAuthenticator.tsx`                  | Make the change-forms prop-driven: inject `onReEnrol(current, next) => Promise<Result>`, `onCancel`, and surface success via a callback instead of reaching for `useAuth` / `useToast` inline. Story each form directly and the mode summary per `mode`.                                                                           |

### Non-auth unique — story the prop-driven surface, extract where clean

`src/components/ProtocolCarousel/` remainder (`DeckCarousel`, `DeckSlotCard`, `ImportTriggerCard`),
`InstallBanner`, `PwaUpdateBanner`, `BrandHeader`, `ResumePill`, `InterviewComplete`, `ViewSwitcher`,
`StatusRow`, `SettingsRow`, `NewSessionForm` (extracted view), `TopActionBar` (extracted view),
`DataView/DataViewToolbar` (extracted view), `OnboardingScreen`.

The exact list is pinned in the implementation plan; the principle is: cover a component when it has a
genuine prop-driven visual surface, extract a presentational view when that surface is clean to lift,
and defer a component only when it is pure orchestration (below).

### Deliberately excluded (pure orchestration), with reason

- **`AuthGate`** (`src/components/AuthGate.tsx`) — routing/effects state machine; nothing meaningful
  to render in isolation.
- **`SetupWizardDialog`** full flow (`src/components/SetupWizardDialog.tsx`) — covered by its
  individual steps; the whole dialog needs live wizard + analytics + auth wiring that is not
  meaningful to fake for a visual story.
- **`DataView`** orchestrator (`src/components/DataView/DataView.tsx`) — needs a query client + Dexie
  data layer; its presentational `DataViewToolbar` is covered instead.
- **`SettingsDialog` / `ImportDialog` / `HomeModal`** full modals — app-state-wired; covered via their
  extracted content sections (`ManageAuthenticator`, `SecurityBehaviorControls`, etc.).

## Verification & guardrails

- **Existing unit tests stay green** after each split (`pnpm --filter @codaco/interviewer-v8 test`,
  i.e. `--project=unit`). Add view-level tests where a split changes structure. Notable existing
  guards: `src/components/__tests__/ManageAuthenticator.test.tsx`,
  `src/lib/auth/__tests__/StepUpAuthDialog.test.tsx`, `src/lib/auth/__tests__/AuthContext.test.tsx`.
- **`pnpm typecheck`**, **`pnpm lint:fix`** (oxlint + oxfmt; no `any`, no `as` bypass, no ignore
  rules), **`pnpm knip`**. knip treats `src/**/*.stories.tsx` as entries via its Storybook plugin
  (the 3 existing stories already pass), so extracted `XView` exports stay clean as long as their
  story or container imports them — confirm with a knip run after the export changes.
- **Visual verification**: confirm each story against the _rendered_ Storybook — build
  (`pnpm --filter @codaco/interviewer-v8 build-storybook`) and screenshot the story — not only via a
  passing `play()` test. The vitest `storybook` browser-mode project is CI-oriented and can flake
  locally, so lean on the build + visual check; kill any running Storybook / dev server on `:6006`
  before relaunching.
- **No changeset**, **no vault/auth runtime change**, **no new dependencies**.

## Risks

- **Behaviour drift from the extraction refactors.** Mitigated by the container keeping the exact
  current call-site contract and the existing unit tests continuing to guard it; add view tests where
  the split changes structure.
- **`Field`-based views need a form store.** Mitigated by the `FormStoreProvider` story decorator; the
  container path is unchanged (the wizard/app already provides the store).
- **knip false positive on a view export.** Low risk given the existing stories pass; a knip run after
  the export changes confirms.
  </content>
  </invoke>
