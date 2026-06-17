# Screenshots to Regenerate

Screenshots that need to be replaced, grouped by the documentation page they appear on.
Image paths are relative to `apps/documentation/public`.

## Using Interviewer (Interviewer 8 screenshots)

Source: `docs/collect-data/interviewer/using-interviewer.en.mdx`

This article switches between **Interviewer 6.x** and **Interviewer 8** via
`<AppSwitch axis="interviewer">`. Screens that exist in both versions use
`<InterviewerScreenshot name="<name>">`, which shows the 6.x shot from
`/assets/img/sample-protocol/<name>.png` (these already exist) and the
Interviewer 8 shot from `/assets/img/interviewer-v8-guide/<name>.png` — the name
must match the 6.x screenshot it replaces. Interviewer-8-only screens (the setup
wizard, security, import/delete dialogs) use plain `![](…)` images pointing
directly at `/assets/img/interviewer-v8-guide/`.

> Note: the article now defaults to the **Interviewer 8** tab, so a missing 8 image
> shows as broken by default. `start-new-section` and `export-section` are now
> **6.x-only** (inside `app="v6"` blocks) and need no 8 capture.

**Dashboard / setup / shell:**

| Image (`/assets/img/interviewer-v8-guide/…`) | Screen                                                 | Status      |
| -------------------------------------------- | ------------------------------------------------------ | ----------- |
| `start-screen.png`                           | Dashboard (deck + Protocols / Data toggle)             | ✅ Captured |
| `protocol-card.png`                          | Protocol card (anatomy + Start new interview button)   | ✅ Captured |
| `case-id.png`                                | Case ID entry dialog                                   | ✅ Captured |
| `import-protocol.png`                        | Import a protocol dialog (file + URL) — 8 only         | ✅ Captured |
| `delete-protocol.png`                        | Delete-protocol confirmation — 8 only                  | ✅ Captured |
| `welcome.png`                                | First-run welcome screen — 8 only                      | ✅ Captured |
| `setup-intro.png`                            | Setup wizard introduction — 8 only                     | ✅ Captured |
| `securing-data.png`                          | Wizard "Securing your data" step — 8 only              | ✅ Captured |
| `auth-method.png`                            | Wizard "Choose an authentication method" — 8 only      | ✅ Captured |
| `analytics.png`                              | Wizard analytics-preference step — 8 only              | ✅ Captured |
| `settings.png`                               | Settings screen — 8 only                               | ✅ Captured |
| `interviewer-ui.png`                         | In-interview navigation (rail / bar: up / down / exit) | ✅ Captured |
| `finish.png`                                 | Finish screen                                          | ✅ Captured |
| `finish-confirm.png`                         | Finish confirmation dialog — 8 only                    | ✅ Captured |
| `interview-complete.png`                     | Interview-complete screen — 8 only                     | ✅ Captured |
| `resume-section.png`                         | The Data page (status, progress, multi-select)         | ✅ Captured |
| `lock-screen.png`                            | The lock screen — 8 only                               | ✅ Captured |

**Interview interface stages** (version-swapped — each matches a 6.x shot of the same name in `sample-protocol/`):

| Image (`/assets/img/interviewer-v8-guide/…`) | Interface                          | Status      |
| -------------------------------------------- | ---------------------------------- | ----------- |
| `welcome-info.png`                           | Information (welcome stage)        | ✅ Captured |
| `consent-form.png`                           | Ego Form (consent)                 | ✅ Captured |
| `ego-form.png`                               | Ego Form (full)                    | ✅ Captured |
| `quick-add.png`                              | Quick Add name generator           | ✅ Captured |
| `side-panel.png`                             | Name generator with side panel     | ✅ Captured |
| `using-forms.png`                            | Name generator using forms         | ✅ Captured |
| `blue-nodes.png`                             | Multiple node types (clinic nodes) | ✅ Captured |
| `small-roster.png`                           | Small roster name generator        | ✅ Captured |
| `large-roster.png`                           | Large roster name generator        | ✅ Captured |
| `per-alter-form.png`                         | Per-Alter Form                     | ✅ Captured |
| `sociogram-positioning.png`                  | Sociogram                          | ✅ Captured |
| `dyad-census.png`                            | Dyad Census                        | ✅ Captured |
| `cat-bin.png`                                | Categorical Bin                    | ✅ Captured |
| `narrative.png`                              | Narrative                          | ✅ Captured |
| `ordinal-bin.png`                            | Ordinal Bin (contact frequency)    | ✅ Captured |

## Building a protocol (Architect Web screenshots)

Source: `docs/design-protocols/building-a-protocol.en.mdx`

This article switches every screenshot between Architect Web and Architect
Desktop via `<AppScreenshot name="<name>" web="true"></AppScreenshot>`. The
component derives both paths from `name`: the Desktop shot at
`/assets/img/architect-guide/<name>.png` (these already exist) and the Web shot at
`/assets/img/architect-web-guide/<name>.png`. Without `web="true"`, the Desktop
shot is shown in both views. To wire a new Web capture, drop it at
`/assets/img/architect-web-guide/<name>.png` and add `web="true"` to that
screenshot in the article.

| Image (`/assets/img/architect-web-guide/…`) | Status      |
| ------------------------------------------- | ----------- |
| `add-a-stage.png`                           | ✅ Captured |
| `information-interface.png`                 | ✅ Captured |
| `edit-item.png`                             | ✅ Captured |
| `completed-stage.png`                       | ✅ Captured |
| `node-type.png`                             | ✅ Captured |
| `node-type-shape.png` (Web-only)            | ✅ Captured |
| `edit-prompt.png`                           | ✅ Captured |
| `side-panel.png`                            | ✅ Captured |
| `form-fields.png`                           | ✅ Captured |
| `input-control.png` (Web-only)              | ✅ Captured |
| `validation.png`                            | ✅ Captured |
| `fields-inputs-prompts.png`                 | ✅ Captured |
| `adding-roster.png`                         | ✅ Captured |
| `roster-sort.png`                           | ✅ Captured |
| `roster-search.png`                         | ✅ Captured |
| `ego-form.png`                              | ✅ Captured |
| `ego-form-fields.png`                       | ✅ Captured |
| `per-alter-form.png`                        | ✅ Captured |
| `sociogram-background.png`                  | ✅ Captured |
| `sociogram-layout.png`                      | ✅ Captured |
| `edge-creation.png`                         | ✅ Captured |
| `dyad-skip.png`                             | ✅ Captured |
| `dyad-prompt.png`                           | ✅ Captured |
| `variable-toggling.png`                     | ✅ Captured |
| `catbin-variables.png`                      | ✅ Captured |
| `filter-skip.png`                           | ✅ Captured |
| `skip.png`                                  | ✅ Captured |
| `catbin-prompt.png`                         | ✅ Captured |
| `followup.png`                              | ✅ Captured |
| `narrative.png`                             | ✅ Captured |
| `edit-preset.png`                           | ✅ Captured |
| `edit-preset2.png`                          | ✅ Captured |
| `narrative-behaviors.png`                   | ✅ Captured |

## About Fresco

Source: `docs/collect-data/fresco/about.en.mdx`

| Image                                              | Alt text              | Status      |
| -------------------------------------------------- | --------------------- | ----------- |
| `/assets/img/fresco-images/features/dashboard.png` | The Fresco dashboard. | ✅ Replaced |

## Using Fresco

Source: `docs/collect-data/fresco/using-fresco.en.mdx`

| Image                                                   | Alt text                                | Status      |
| ------------------------------------------------------- | --------------------------------------- | ----------- |
| `/assets/img/fresco-images/protocols-page.png`          | The protocols page in the dashboard.    | ✅ Replaced |
| `/assets/img/fresco-images/participants-page.png`       | The participants page in the dashboard. | ✅ Replaced |
| `/assets/img/fresco-images/participants-add-single.png` | Adding a single participant             | ✅ Replaced |
| `/assets/img/fresco-images/csv-import.png`              | The CSV import dialog                   | ✅ Replaced |
| `/assets/img/fresco-images/settings-page.png`           | The settings page in the dashboard.     | ✅ Replaced |

## Workflows overview (Planning a Study)

Source: `docs/get-started/planning-a-study/workflows.en.mdx`

| Image                                             | Alt text                                                                                                | Status                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `/assets/img/offline-data/workflows-overview.svg` | The three-step Network Canvas workflow (design → collect → export) with per-step app/options and icons. | ✅ New hand-authored SVG (brand colors, Quicksand). Revisit if app names/icons change. |

## Deployment guide

Sources: `docs/collect-data/fresco/guide.en.mdx` and `docs/collect-data/fresco/guide-vercel.en.mdx` (both reference the same images)

| Image                                   | Alt text / caption                                             | Status              |
| --------------------------------------- | -------------------------------------------------------------- | ------------------- |
| `/assets/img/fresco-images/fresco1.png` | Enter a username and password                                  | ✅ Replaced         |
| `/assets/img/fresco-images/fresco2.png` | Paste your environment variable into the form                  | ✅ Replaced         |
| `/assets/img/fresco-images/fresco3.png` | Upload a protocol                                              | ✅ Replaced         |
| `/assets/img/fresco-images/fresco4.png` | Import participants and optionally allow anonymous recruitment | ⬜ Not yet replaced |

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
