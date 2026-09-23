# Screenshots to Regenerate

Screenshots that need to be replaced, grouped by the documentation page they appear on.
Image paths are relative to `apps/documentation/public`.

## September 2026 releases (Architect 8.3.0, Interviewer 8.3.0, Fresco 4.2.0)

Every image in the Building a protocol tutorial was recaptured for 8.3.0,
not only the ones these releases changed: that article's screenshots all
predated the new stage editor, so the whole set was retaken together.

Every image these releases made stale has been recaptured from the release
builds (the `changeset-release/main` tree, which carries the release version
numbers): Architect and Interviewer 8.3.0 driving the bundled Sample Protocol,
and Fresco 4.2.0 running locally against Postgres and MinIO, with the sample
protocol imported and six participants and interviews. Interviewer also gained
`interviewer-guide/interview-settings.png`, a new capture of the in-interview
settings menu, now shown in Using Interviewer.

One set is still outstanding: the **interview interface stage** captures below
were taken before 8.3 moved Exit into a settings popover, so they show the old
rail with an exit icon at the top. `interviewer-ui.png`, which the navigation
walkthrough depends on, has been recaptured; the stage shots need an interview
driven through the sample protocol with representative data, which is a
separate pass. Every other row is done.

## Using Interviewer (Interviewer screenshots)

Source: `docs/collect-data/interviewer/using-interviewer.en.mdx`

This article switches between **Interviewer Classic** and **Interviewer** via
`<AppSwitch axis="interviewer">`. Screens that exist in both versions use
`<InterviewerScreenshot name="<name>">`, which shows the 6.x shot from
`/assets/img/sample-protocol/<name>.png` (these already exist) and the
Interviewer shot from `/assets/img/interviewer-guide/<name>.png` — the name
must match the 6.x screenshot it replaces. Interviewer-8-only screens (the setup
wizard, security, import/delete dialogs) use plain `![](…)` images pointing
directly at `/assets/img/interviewer-guide/`.

> Note: the article now defaults to the **Interviewer** tab, so a missing 8 image
> shows as broken by default. `start-new-section` and `export-section` are now
> **6.x-only** (inside `app="classic"` blocks) and need no 8 capture.

**Dashboard / setup / shell:**

| Image (`/assets/img/interviewer-guide/…`) | Screen                                                 | Status                  |
| ----------------------------------------- | ------------------------------------------------------ | ----------------------- |
| `start-screen.png`                        | Dashboard (deck + Protocols / Data toggle)             | ✅ Recaptured for 8.3.0 |
| `protocol-card.png`                       | Protocol card (anatomy + Start new interview button)   | ✅ Captured             |
| `case-id.png`                             | Case ID entry dialog                                   | ✅ Captured             |
| `import-protocol.png`                     | Import a protocol dialog (file + URL) — 8 only         | ✅ Captured             |
| `delete-protocol.png`                     | Delete-protocol confirmation — 8 only                  | ✅ Captured             |
| `welcome.png`                             | First-run welcome screen — 8 only                      | ✅ Recaptured for 8.3.0 |
| `setup-intro.png`                         | Setup wizard introduction — 8 only                     | ✅ Recaptured for 8.3.0 |
| `securing-data.png`                       | Wizard "Securing your data" step — 8 only              | ✅ Recaptured for 8.3.0 |
| `auth-method.png`                         | Wizard "Choose an authentication method" — 8 only      | ✅ Recaptured for 8.3.0 |
| `analytics.png`                           | Wizard analytics-preference step — 8 only              | ✅ Recaptured for 8.3.0 |
| `settings.png`                            | Settings screen — 8 only                               | ✅ Recaptured for 8.3.0 |
| `interviewer-ui.png`                      | In-interview navigation (rail / bar: up / down / exit) | ✅ Captured             |
| `finish.png`                              | Finish screen                                          | ✅ Captured             |
| `finish-confirm.png`                      | Finish confirmation dialog — 8 only                    | ✅ Captured             |
| `interview-complete.png`                  | Interview-complete screen — 8 only                     | ✅ Captured             |
| `resume-section.png`                      | The Data page (status, progress, multi-select)         | ✅ Captured             |
| `lock-screen.png`                         | The lock screen — 8 only                               | ✅ Captured             |

**Interview interface stages** (version-swapped — each matches a 6.x shot of the same name in `sample-protocol/`):

| Image (`/assets/img/interviewer-guide/…`) | Interface                          | Status                                           |
| ----------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| `welcome-info.png`                        | Information (welcome stage)        | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `consent-form.png`                        | Ego Form (consent)                 | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `ego-form.png`                            | Ego Form (full)                    | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `quick-add.png`                           | Quick Add name generator           | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `side-panel.png`                          | Name generator with side panel     | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `using-forms.png`                         | Name generator using forms         | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `blue-nodes.png`                          | Multiple node types (clinic nodes) | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `small-roster.png`                        | Small roster name generator        | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `large-roster.png`                        | Large roster name generator        | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `per-alter-form.png`                      | Per-Alter Form                     | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `sociogram-positioning.png`               | Sociogram                          | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `dyad-census.png`                         | Dyad Census                        | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `cat-bin.png`                             | Categorical Bin                    | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `narrative.png`                           | Narrative                          | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |
| `ordinal-bin.png`                         | Ordinal Bin (contact frequency)    | 🔄 Recapture — pre-8.3 rail (exit icon, no gear) |

## Building a protocol (Architect screenshots)

Source: `docs/design-protocols/tutorials/building-a-protocol.en.mdx`

This article switches every screenshot between Architect and Architect
Desktop via `<AppScreenshot name="<name>" web="true"></AppScreenshot>`. The
component derives both paths from `name`: the Desktop shot at
`/assets/img/architect-classic-guide/<name>.png` (these already exist) and the Web shot at
`/assets/img/architect-guide/<name>.png`. Without `web="true"`, the Desktop
shot is shown in both views. To wire a new Web capture, drop it at
`/assets/img/architect-guide/<name>.png` and add `web="true"` to that
screenshot in the article.

| Image (`/assets/img/architect-guide/…`) | Status                  |
| --------------------------------------- | ----------------------- |
| `add-a-stage.png`                       | ✅ Recaptured for 8.3.0 |
| `information-interface.png`             | ✅ Recaptured for 8.3.0 |
| `edit-item.png`                         | ✅ Recaptured for 8.3.0 |
| `completed-stage.png`                   | ✅ Recaptured for 8.3.0 |
| `node-type.png`                         | ✅ Recaptured for 8.3.0 |
| `node-type-shape.png` (Web-only)        | ✅ Recaptured for 8.3.0 |
| `edit-prompt.png`                       | ✅ Recaptured for 8.3.0 |
| `side-panel.png`                        | ✅ Recaptured for 8.3.0 |
| `form-fields.png`                       | ✅ Recaptured for 8.3.0 |
| `input-control.png` (Web-only)          | ✅ Recaptured for 8.3.0 |
| `validation.png`                        | ✅ Recaptured for 8.3.0 |
| `fields-inputs-prompts.png`             | ✅ Recaptured for 8.3.0 |
| `adding-roster.png`                     | ✅ Recaptured for 8.3.0 |
| `roster-sort.png`                       | ✅ Recaptured for 8.3.0 |
| `roster-search.png`                     | ✅ Recaptured for 8.3.0 |
| `ego-form.png`                          | ✅ Recaptured for 8.3.0 |
| `ego-form-fields.png`                   | ✅ Recaptured for 8.3.0 |
| `per-alter-form.png`                    | ✅ Recaptured for 8.3.0 |
| `sociogram-background.png`              | ✅ Recaptured for 8.3.0 |
| `sociogram-layout.png`                  | ✅ Recaptured for 8.3.0 |
| `edge-creation.png`                     | ✅ Recaptured for 8.3.0 |
| `dyad-skip.png`                         | ✅ Recaptured for 8.3.0 |
| `dyad-prompt.png`                       | ✅ Recaptured for 8.3.0 |
| `variable-toggling.png`                 | ✅ Recaptured for 8.3.0 |
| `catbin-variables.png`                  | ✅ Recaptured for 8.3.0 |
| `filter-skip.png`                       | ✅ Recaptured for 8.3.0 |
| `skip.png`                              | ✅ Recaptured for 8.3.0 |
| `catbin-prompt.png`                     | ✅ Recaptured for 8.3.0 |
| `followup.png`                          | ✅ Recaptured for 8.3.0 |
| `narrative.png`                         | ✅ Recaptured for 8.3.0 |
| `edit-preset.png`                       | ✅ Recaptured for 8.3.0 |
| `edit-preset2.png`                      | ✅ Recaptured for 8.3.0 |
| `narrative-behaviors.png`               | ✅ Recaptured for 8.3.0 |

## About Fresco

Source: `docs/collect-data/fresco/about.en.mdx`

| Image                                              | Alt text              | Status                  |
| -------------------------------------------------- | --------------------- | ----------------------- |
| `/assets/img/fresco-images/features/dashboard.png` | The Fresco dashboard. | ✅ Recaptured for 4.2.0 |

## Using Fresco

Source: `docs/collect-data/fresco/using-fresco.en.mdx`

| Image                                                   | Alt text                                | Status                  |
| ------------------------------------------------------- | --------------------------------------- | ----------------------- |
| `/assets/img/fresco-images/protocols-page.png`          | The protocols page in the dashboard.    | ✅ Recaptured for 4.2.0 |
| `/assets/img/fresco-images/participants-page.png`       | The participants page in the dashboard. | ✅ Recaptured for 4.2.0 |
| `/assets/img/fresco-images/participants-add-single.png` | Adding a single participant             | ✅ Replaced             |
| `/assets/img/fresco-images/csv-import.png`              | The CSV import dialog                   | ✅ Replaced             |
| `/assets/img/fresco-images/settings-page.png`           | The settings page in the dashboard.     | ✅ Recaptured for 4.2.0 |

## Workflows overview (Planning a Study)

Source: `docs/get-started/planning-a-study/workflows.en.mdx`

| Image                                             | Alt text                                                                                                | Status                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `/assets/img/offline-data/workflows-overview.svg` | The three-step Network Canvas workflow (design → collect → export) with per-step app/options and icons. | ✅ New hand-authored SVG (brand colors, Quicksand). Revisit if app names/icons change. |

## Deployment guide

Sources: `docs/collect-data/fresco/guide.en.mdx` and `docs/collect-data/fresco/guide-vercel.en.mdx` (both reference the same images)

| Image                                   | Alt text / caption                                                  | Status                  |
| --------------------------------------- | ------------------------------------------------------------------- | ----------------------- |
| `/assets/img/fresco-images/fresco1.png` | Enter a username and password                                       | ✅ Recaptured for 4.2.0 |
| `/assets/img/fresco-images/fresco2.png` | Paste your environment variable into the form                       | ✅ Recaptured for 4.2.0 |
| `/assets/img/fresco-images/fresco3.png` | Upload a protocol                                                   | ✅ Recaptured for 4.2.0 |
| `/assets/img/fresco-images/fresco4.png` | The final setup step links to documentation and opens the dashboard | ✅ Recaptured for 4.2.0 |

---

# ✅ DONE: Document the two storage backend options (S3 vs UploadThing)

> **Status: implemented** — the prose/spec changes below have been written across all
> six articles and the documentation app builds cleanly. Still outstanding: the two
> **new screenshots** (storage provider selector + S3 config form) listed at the end.
>
> The deployment docs previously presented **UploadThing as the only storage option**.
> Fresco offers a storage-provider choice during first-run setup:
> **UploadThing** (hosted) **or any S3-compatible store** (AWS S3, MinIO, Cloudflare R2,
> Backblaze B2). This is now documented across the articles below.

## Background (verified against the Fresco source at `../Fresco`)

- First-run **setup wizard** has steps: **Create account → Configure storage → Upload protocol → Documentation**. The storage step lets the user pick a provider via a selector (`StorageProviderSelector.tsx`), then fill a provider-specific form.
- **Provider selection precedence** (`lib/storage/config.ts`): `STORAGE_PROVIDER` env var (pins the choice, locks the UI) → `storageProvider` DB setting → default **`uploadthing`**.
- **The chosen provider cannot be changed once any protocol/asset has been uploaded** (`hasProtocols()` guard). Worth calling out explicitly in the docs.
- **Per-file upload limit is 256 MB** for both providers (`fresco.config.ts` → `MAX_PROTOCOL_UPLOAD_BYTES`).
- Storage can be configured **in the UI** (saved to DB) or **pinned via env vars** (then shown read-only/"locked" in the UI).

### Environment variables (exact names, from `env.js`)

| Provider           | Env vars                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Switch             | `STORAGE_PROVIDER` = `s3` \| `uploadthing` (optional; pins provider)                                 |
| UploadThing        | `UPLOADTHING_TOKEN`                                                                                  |
| S3 / S3-compatible | `S3_ENDPOINT`, `S3_PUBLIC_URL`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |

- `S3_ENDPOINT` = server-side API URL; `S3_PUBLIC_URL` = browser-facing URL used to sign GET/PUT URLs. **They differ for MinIO behind a reverse proxy** (public URL = your Fresco domain); for AWS S3 / R2 they're usually the same.
- ⚠️ Note: `advanced.en.mdx` still documents the **outdated** `UPLOADTHING_SECRET` / `UPLOADTHING_APP_ID` vars — these are superseded by the single `UPLOADTHING_TOKEN`. Fix while we're in here.

### When to choose which (for a "choosing a backend" callout)

- **UploadThing** — easiest: paste one token, no infra. Free tier is US-only (2 GB); EU regions require a paid plan. Requires the `/api/uploadthing` endpoint to be reachable from the public Internet (upload callback).
- **S3-compatible** — full control over region/data residency, self-hostable (MinIO), low lock-in. No public callback endpoint required. More setup (6 fields + bucket/CORS prep).

## Documentation changes needed, by article

> **Decision (2026-06-15):** the standard guides keep S3 light — they recommend
> UploadThing for most studies, list the reasons to choose S3, and link out. The full
> S3 setup detail lives in **advanced deployment**.

### 1. `deployment/guide.en.mdx` and `deployment/guide-vercel.en.mdx` — PRIMARY

- Renamed the **"Create a storage bucket using UploadThing"** section → **"Configure storage"**.
- Added an intro explaining the two options, recommending **UploadThing for most studies**, listing the reasons to choose S3, and linking S3 users to `advanced#storage-configuration`.
- Kept the existing 8-step **UploadThing** path under the H4 `#### Create a storage bucket using UploadThing` (preserves the in-app deep-link anchor).
- Noted that the provider is chosen during onboarding and **cannot be changed from the dashboard afterward** (only credentials are editable later), plus the 256 MB protocol file limit.
- **No new screenshots needed** here — S3 detail is not in these guides.

### 2. `deployment/advanced.en.mdx` (self-hosted Docker) — home for S3 detail

- Replaced outdated `UPLOADTHING_SECRET` / `UPLOADTHING_APP_ID` with `UPLOADTHING_TOKEN`.
- Added a `### Storage Configuration` section documenting both providers: `UPLOADTHING_TOKEN`, or `STORAGE_PROVIDER=s3` + all six `S3_*` vars (with a reference table), the endpoint-vs-public-URL nuance, CORS, and the bucket prep. Added storage hints to the Docker Compose example.
- Noted that self-hosting with MinIO removes the public `/api/uploadthing` callback requirement.

### 3. `deployment/it-faq.en.mdx`

- Already covers S3-compatible backends well — add a cross-link to the new "Configure storage" section so the setup guide and IT FAQ stay consistent.

### 4. `deployment/cloud-pricing.en.md`

- UploadThing pricing is covered. Add a short note on S3-compatible cost models (AWS S3 storage/egress, R2 flat/no-egress, B2, self-hosted MinIO).

### 5. `using-fresco.en.mdx`

- Line ~57 says assets upload "to the UploadThing service" — generalize to "to your configured storage provider".

### 6. `faq.en.mdx`

- Verify storage/GDPR answers reflect both backends (mostly OK; check the "study assets stored in S3 via UploadThing" line reads correctly for the S3 case).

## Storage docs screenshots

- `fresco2.png` — UploadThing token form (Configure Storage step) — ✅ Replaced.
- `configure-storage-s3.png` — Configure Storage step with S3-compatible selected — ✅ Added to the basic guides (`guide.en.mdx` / `guide-vercel.en.mdx`) in the new "Use an S3-compatible bucket" steps. (The advanced guide is env-based: no screenshot.)
