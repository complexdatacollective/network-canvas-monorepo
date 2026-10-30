# Deploying Fresco — storyboard

Source: `apps/documentation/docs/collect-data/fresco/guide.en.mdx` (with the changes listed under _Guide changes_, 2026-10-30).
Prerequisite articles read: `about.en.mdx`, plus the articles the guide sends the reader to mid-procedure: `deployment-troubleshooting.en.mdx` (#reset-your-database, protected URL, invalid environment variables) and `accounts.en.mdx` (recovering access).

Built as `walkthroughs/fresco-deployment/en.ts`; this storyboard matches it beat for beat. Captures are recorded by `walkthroughs/fresco-deployment/capture.ts`.

Chapter ids are the ones embedded in the guide (`<Walkthrough id="fresco-deployment" chapter="…">`): `fork`, `database`, `netlify`, `setup`, `storage`, `finish`. The `start` chapter opens from the card at the top of the guide.

## Brief

- **Reader:** A researcher who will run a study on Fresco. Comfortable with web apps (email, cloud storage, online forms) and with signing up for services. Has never used GitHub, a cloud console, a database, or a terminal. May or may not already have a GitHub account. Probably has a Network Canvas protocol file, but not necessarily yet.
- **Outcome:** A running Fresco instance at their own `….netlify.app` address, with their admin account created, storage connected, setup finished, and their sign-in details stored safely. Optionally, a first protocol uploaded.
- **Context of use:** The walkthrough sits in a docs dialog. The reader has a second tab open on GitHub, Neon, Netlify, UploadThing, or their new Fresco, and switches back after every do beat. They also keep a plain-text file open, because the database text copied from Neon is pasted into Netlify minutes later. One sitting of about an hour (the guide's estimate); the 2-hour setup limit makes a break after chapter 3 risky.
- **Unfamiliar terms:**
  - _fork_ — defined in 1.1 ("your own copy of the Fresco code"); the GitHub button is labeled **Fork**, so the word stays.
  - _repository_ — only as the field label **Repository name**; otherwise "your copy".
  - _instance_ — defined in 0.1.
  - _deploy_ — only in Netlify's **Deploy** button; 3.1 says "runs it at its own web address".
  - _database_ — plain enough; 2.1 says what it is for. "PostgreSQL" avoided.
  - _environment variables_, _.env_ — avoided as a concept; "the text in your file". **.env**, **Add environment variables** and **Import from a .env file** appear only as labels to match.
  - _region_ — a field label; the reader is told which value to pick.
  - _API key / token_ — UploadThing's **API Keys** and Fresco's **UPLOADTHING_TOKEN** labels; 4.7 calls it "one key".
  - _S3, bucket, access key, CORS_ — not defined. Only readers who choose the S3 branch see them, and that branch is for readers who already have S3 storage (the guide's framing).
  - _passkey_ — 4.3 describes it in the reader's terms (fingerprint, face or PIN).
  - _Prisma, pooled/unpooled connection, Next.js, build settings_ — omitted.

## Judgment calls and open questions

1. **Order kept as in the guide, despite the 2-hour limit.** The guide has readers create their UploadThing account _after_ deploying, inside the 2-hour window. Creating it first would be safer, but the walkthrough follows the guide; 3.10 warns about the limit when the clock starts. **Open:** reorder the guide?
2. **Neon's screenshot disagrees with its tip.** `neon-db-2.png` shows **AWS US East 1 (N. Virginia)** selected while the guide (and 2.4) say **AWS US East 2 (Ohio)**. 2.4 highlights the Region field and states the value in text. **Open:** retake the screenshot.
3. **4.5 advances on a named confirmation.** It is typed explain, but saving the details is an action, so its button reads "I've saved them".
4. **Analytics (5.4) is a beat, not a link.** It is the one finish-section note a reader with IRB constraints must act on before collecting data.
5. **Every beat has a picture.** Third-party steps without a screenshot in the guide (GitHub sign-up and sign-in, Neon and Netlify sign-in, Netlify's repository list, the finished fork page) get illustrated scenes rather than new screenshots, so the walkthrough never shows a third-party screen the guide doesn't.
6. **UploadThing sign-in is two beats** (4.9, 4.9b), one per screenshot: the sign-in page, then GitHub's authorization page.
7. **Storage captures stop at Save and continue.** Fresco verifies an UploadThing token with UploadThing before moving on, and refuses an S3 endpoint on a loopback address, so neither can be saved with made-up values in local dev. The UploadThing clip ends with Fresco saving (the script holds the request open), and the S3 clip with the pointer on **Save and continue**; the next beat shows what follows.

## Guide changes

Made in `guide.en.mdx` so the article and the walkthrough agree:

- **Create fork** and **Copy snippet** — capitalization matched to the screens.
- "a plain-text file … avoid word processors and rich-text notes apps, which can change the quotation marks" — replaces "a text file or notes app", which could break the pasted database text.
- Create an account: "enter it twice to confirm it", and "To use a passkey, click **Create account** and follow your device's prompt."
- Upload a protocol: "Drag your `.netcanvas` file onto the upload area, or click **Browse files**. When **Protocol imported successfully** appears, click **Continue**." (The success message covers the Continue button until it closes.)

Still to decide: the guide's step 9 says **"Deploy"**; the button reads **Deploy _your-project-name_** (3.9 matches the button). See also judgment calls 1 and 2.

## Unverified labels

Checked against a screenshot, a capture, or the source, except:

- Neon's **Login** and **GitHub** sign-in buttons (2.2) — from the guide's text; 2.2 shows a scene, not Neon's page.
- Netlify's GitHub permission prompt (3.3) — "allow the permissions GitHub asks for" stays generic for that reason.

## Coverage map

| Article section                                             | Treatment                                    | Reason                                                                                          |
| ----------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Summary card: duration, prerequisites                       | include (0.2, 0.3)                           | The reader must set aside one sitting and have a GitHub account; the account becomes a choice.  |
| Prerequisite: read _About Fresco_                           | link out (0.1 guide link)                    | Context, not action.                                                                            |
| Intro: Fresco is a web app you "deploy"                     | condense (0.1)                               | One scene: four services each hold one piece of your Fresco.                                    |
| Intro: you are responsible for security; team has no access | condense (4.5)                               | Acted on at one moment: storing sign-in details safely.                                         |
| Intro: GitHub / PostgreSQL / object storage list            | condense (0.1)                               | Merged into the scene. PostgreSQL and S3 internals omitted.                                     |
| Intro: why Netlify; not required                            | omit                                         | Changes no step.                                                                                |
| Intro: Vercel guide still available                         | omit                                         | Legacy path that leads away from this walkthrough.                                              |
| How much does deploying Fresco cost?                        | condense (0.2)                               | Every service has a free plan, and the walkthrough uses it. Chapter guide link covers pricing.  |
| Cost: advanced deployment on own infrastructure             | omit                                         | A different procedure and reader.                                                               |
| Create a fork of Fresco                                     | include (ch. 1)                              | Core step.                                                                                      |
| Create a database (Neon), steps 1–6                         | include (ch. 2)                              | Core step.                                                                                      |
| Neon region tip (Ohio)                                      | include as the instruction (2.4)             | The reader acts on it; the latency rationale is omitted.                                        |
| Neon: free tier, pricing link                               | omit                                         | Free tier is the default; the reader does nothing.                                              |
| Danger: delete the # before DATABASE_URL_UNPOOLED           | include as own beats (2.8, checked in 2.9)   | The most common deployment error (troubleshooting article's first entry).                       |
| Neon: "uncomment next line if you use Prisma <5.10" comment | omit                                         | The reader leaves it alone; the scenes show it untouched.                                       |
| Create a project on Netlify, steps 1–10                     | include (ch. 3)                              | Core step.                                                                                      |
| Netlify: troubleshooting/community tip                      | include in checkpoint 3.12 (troubleshooting) | Where the reader needs it: when the deploy fails.                                               |
| Netlify: project name determines the address                | include (3.5)                                | The reader chooses it and will see it in their address.                                         |
| Netlify: "Contains secret values"                           | include (3.8)                                | The reader acts on it.                                                                          |
| Netlify build settings (shown in stills)                    | omit                                         | The reader changes nothing.                                                                     |
| Configuration and setup: intro                              | condense (4.1)                               | One sentence on the four setup steps.                                                           |
| Danger: 2 hours to finish setup                             | include as own beat (3.10)                   | Placed when the clock starts.                                                                   |
| Create a user account                                       | include (4.2–4.5)                            | Core step. Passkey or password becomes a choice.                                                |
| Tip: v4 multiple accounts, User Management                  | link out (5.5, Accounts & security)          | After deployment; not needed for the outcome.                                                   |
| Danger: no email password reset; recovery options           | condense (4.5)                               | One beat: store details safely. Recovery is in Accounts & security (4.5 guide link).            |
| Configure storage: two providers                            | include as a choice (4.6)                    | The options lead to different steps.                                                            |
| Danger: cannot switch provider type later                   | include in the choice's text (4.6)           | Acted on at the moment of choosing.                                                             |
| Tip: 256 MB protocol limit                                  | omit                                         | Rarely matters; shows as an error at upload if it does.                                         |
| Create a storage bucket using UploadThing, steps 1–8        | include (UploadThing branch, 4.7–4.13)       | Core step for most readers.                                                                     |
| UploadThing: account is private to you; docs link           | omit                                         | Reassurance, not action.                                                                        |
| UploadThing: do not change region                           | condense (4.11)                              | "Leave the region as it is."                                                                    |
| Use an S3-compatible bucket                                 | condense (S3 branch, 4.S1–4.S3)              | Bucket preparation is linked out; only the form is walked. This branch's reader already has S3. |
| Upload a protocol                                           | include as a choice (5.1–5.2b)               | Optional; the options lead to different steps.                                                  |
| Finish setup                                                | include (5.3)                                | Core step.                                                                                      |
| Finish: add participants, anonymous recruitment             | link out (5.5, Using Fresco)                 | Using Fresco, not deploying it.                                                                 |
| Tip: anonymous analytics                                    | condense (5.4)                               | Where the setting is; the full data picture is left to the guide.                               |
| Set up a custom domain (optional)                           | omit                                         | Optional and after the outcome; readers find it in the guide right after Finish setup.          |

## Choices

| Id         | Beat | Question                                   | Options → beats shown                                                       |
| ---------- | ---- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `github`   | 0.3  | Do you have a GitHub account?              | **Yes, I have one** → skip 0.4 · **No, not yet** → 0.4                      |
| `auth`     | 4.3  | How will you sign in to Fresco?            | **Passkey** → 4.4b · **Password** → 4.4a                                    |
| `storage`  | 4.6  | Where should Fresco store files?           | **UploadThing (recommended)** → 4.7–4.13 · **My own S3 bucket** → 4.S1–4.S3 |
| `protocol` | 5.1  | Do you have a protocol file to upload now? | **Yes** → 5.2a · **Not yet** → 5.2b                                         |

## Chapters

Beat ids are the built ids, so the storage chapter keeps the 4.x numbers it started with.

Visuals: `scene:` an illustrated scene in the style of networkcanvas.com/updates; `still:` a guide screenshot in the illustrated browser window, with its highlights in order; `capture:` a recording from `capture.ts` in the same window.

### 0. Before you start · guide: #how-much-does-deploying-fresco-cost (`start`)

They know what they will build, have an hour, and are signed in to GitHub.

| #   | Type       | On-screen text                                                                                            | Visual                                                                                                                         | Advances when                         | Guide link   |
| --- | ---------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------ |
| 0.1 | explain    | You'll set up your own copy of Fresco — an **instance** — using four free services. Each holds one piece. | scene: GitHub, Neon, UploadThing and Netlify tiles send particles into a browser window that becomes "Your Fresco"; FREE badge | Continue                              | About Fresco |
| 0.2 | explain    | Plan about an hour in one sitting. Every service has a free plan, and you'll use it.                      | scene: a clock sweeps an hour; "About 1 hour"; FREE badge                                                                      | Continue                              |              |
| 0.3 | choose     | Do you have a GitHub account?                                                                             | scene: you and a GitHub tile joined by a dotted line; "?" badge                                                                | **Yes, I have one** / **No, not yet** |              |
| 0.4 | do         | Go to [github.com](https://github.com/signup) and create a free account.                                  | scene: a sign-up form fills in field by field; the cursor clicks Create account                                                | "I've created my account"             |              |
| 0.5 | checkpoint | Open a second tab and [sign in to GitHub](https://github.com/login). Keep this walkthrough beside it.     | scene: this walkthrough beside GitHub's sign-in; the cursor clicks the GitHub button and the account appears                   | "I'm signed in"                       |              |

### 1. Copy the Fresco code · guide: #create-a-fork-of-fresco (`fork`)

They have their own copy (fork) of Fresco on GitHub.

| #   | Type       | On-screen text                                                                      | Visual                                                                                                   | Advances when                | Guide link |
| --- | ---------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------- |
| 1.1 | explain    | First, make your own copy of the Fresco code. GitHub calls this a **fork**.         | scene: a copy lifts off Fresco's code card and lands as "you/your-study"; FORK badge                     | Continue                     |            |
| 1.2 | do         | Open **github.com/complexdatacollective/Fresco** and click **Fork**.                | still: github-fork1.png, Fork                                                                            | "I've clicked Fork"          |            |
| 1.3 | do         | Change **Repository name** to your study's name. This becomes your instance's name. | still: github-fork2.png, Repository name                                                                 | "I've named it"              |            |
| 1.4 | do         | Leave **Copy the main branch only** ticked, then click **Create fork**.             | still: github-fork2.png, the checkbox then Create fork                                                   | "I've created the fork"      |            |
| 1.5 | checkpoint | GitHub now shows your copy, under your username, with the name you chose.           | scene: your copy's page, "you / your-study, forked from complexdatacollective/Fresco", the name ringed ¹ | "I see it" / troubleshooting |            |

¹ The guide has no screenshot of the finished fork page, so this is a scene rather than a new screenshot.

### 2. Create a database · guide: #create-a-database (`database`)

They have a Neon database, and its text saved in a plain-text file with the `#` removed.

| #   | Type       | On-screen text                                                                               | Visual                                                                                  | Advances when                   | Guide link |
| --- | ---------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------- | ---------- |
| 2.1 | explain    | Fresco keeps your study's data in a database. Next, you'll create a free one on Neon.        | scene: data particles travel from your Fresco to Neon; a database stacks up             | Continue                        |            |
| 2.2 | do         | Go to [neon.com](https://neon.com/), click **Login**, then sign in with **GitHub**.          | scene: Neon's sign-in; the cursor clicks Continue with GitHub and the account appears   | "I'm signed in"                 |            |
| 2.3 | do         | On your dashboard, click **Create Project**.                                                 | still: neon-db-1.png, Create Project                                                    | "It's open"                     |            |
| 2.4 | do         | Type a **Project name**, then set **Region** to **AWS US East 2 (Ohio)**.                    | still: neon-db-2.png, Project name then Region ²                                        | "I've set both"                 |            |
| 2.5 | do         | Click **Create**.                                                                            | still: neon-db-2.png, Create                                                            | "I've created it"               |            |
| 2.6 | do         | Under **Connect to your database**, click **Connect**.                                       | still: neon-db-3.png, Connect                                                           | "It's open"                     |            |
| 2.7 | do         | Choose **Prisma**, open the **.env** tab, and click **Copy snippet**.                        | still: neon-db-4.png, Prisma, .env, Copy snippet in turn                                | "I've copied it"                |            |
| 2.8 | do         | Paste it into a plain-text file, then delete the **#** before **DATABASE_URL_UNPOOLED**.     | scene: the text file; the cursor clicks the `#`, it disappears and the line turns solid | "I've deleted the #"            |            |
| 2.9 | checkpoint | Two lines start with **DATABASE_URL**, with no **#** in front of either. Keep the file open. | scene: the text file, both DATABASE_URL lines picked out                                | "Looks right" / troubleshooting |            |

² See judgment call 2: the screenshot shows a different region from the one the text asks for.
2.9 checks "two lines start with **DATABASE_URL**" rather than "the file has two lines", because Neon's snippet also has a comment line.

### 3. Put Fresco online · guide: #create-a-project-on-netlify (`netlify`)

Netlify has built their copy of Fresco, and they have opened its address.

| #    | Type       | On-screen text                                                                                                       | Visual                                                                         | Advances when                  | Guide link               |
| ---- | ---------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------ | ------------------------ |
| 3.1  | explain    | Netlify takes your copy of the code and runs it at its own web address.                                              | scene: your copy travels into a Netlify cloud; a build bar fills; LIVE badge   | Continue                       |                          |
| 3.2  | do         | Open [app.netlify.com/start](https://app.netlify.com/start) and sign in with **GitHub**.                             | scene: Netlify's sign-in; the cursor clicks Continue with GitHub               | "I'm signed in"                |                          |
| 3.3  | do         | Under **Let's deploy your project with…**, click **GitHub**, then allow the permissions GitHub asks for.             | still: netlify-1.png, GitHub                                                   | "I've connected GitHub"        |                          |
| 3.4  | do         | Click the copy of Fresco you named on GitHub.                                                                        | scene: Netlify's project list; the cursor picks "your-study" ³                 | "I've chosen it"               |                          |
| 3.5  | do         | Type a **Project name**. It becomes your Fresco address: _name_.netlify.app.                                         | still: netlify-2.png, Project name                                             | "I've named it"                |                          |
| 3.6  | do         | In your text file, select **all** the text and copy it.                                                              | scene: the text file; every line is selected, then "Copied"                    | "I've copied it"               |                          |
| 3.7  | do         | Scroll down. Click **Add environment variables**, then **Import from a .env file**.                                  | still: netlify-3.png, the menu                                                 | "I've opened it"               |                          |
| 3.8  | do         | Paste into **Contents of .env file**, then tick **Contains secret values**.                                          | still: netlify-4.png, the text box then the checkbox                           | "I've pasted and ticked it"    |                          |
| 3.9  | do         | Click **Deploy _your-project-name_**. Building takes 2–5 minutes.                                                    | still: netlify-4.png, Deploy                                                   | "I've clicked Deploy"          |                          |
| 3.10 | explain    | Once it's live, you have **2 hours** to finish setting up Fresco. After that, setup expires and has to be restarted. | scene: Fresco's setup steps beside a clock sweeping two hours; "2 HOURS" badge | "I'll finish within 2 hours"   | #configuration-and-setup |
| 3.11 | do         | When it's done, click the green address under your project name.                                                     | still: netlify-5.png, the address                                              | "Fresco has opened"            |                          |
| 3.12 | checkpoint | You should see **Create an Admin Account**. If Netlify asks you to sign in, you opened the wrong address.            | still: fresco1.png, whole screen                                               | "I see it" / troubleshooting ⁴ |                          |

³ The guide has no screenshot of Netlify's repository list, so this is a scene.
⁴ The troubleshooting link covers both failures here: "Invalid environment variables" (usually the `#`) and Netlify's protected-URL sign-in.
3.12's second sentence paraphrases the troubleshooting article's protected-URL entry; the mistake is common and stops the reader at the start of the 2-hour window.

### 4. Create your account · guide: #configuration-and-setup (`setup`)

They have an admin account and their sign-in details stored safely.

| #    | Type    | On-screen text                                                                                                           | Visual                                                                                                                  | Advances when              | Guide link             |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------- |
| 4.1  | explain | Fresco now walks you through four setup steps. The first creates your administrator account.                             | still: fresco1.png, the step list                                                                                       | Continue                   |                        |
| 4.2  | do      | Type a **Username**: at least 4 characters, no spaces.                                                                   | capture: `account-username` — typing `fresco-demo-admin`                                                                | "I've typed it"            | #create-a-user-account |
| 4.3  | choose  | Choose how you'll sign in. **Passkey** uses your device's fingerprint, face or PIN. **Password** is a password you type. | still: fresco1.png, Passkey then Password                                                                               | **Passkey** / **Password** |                        |
| 4.4a | do      | Choose **Password** and enter the strongest password you can, twice. Then click **Create account**.                      | capture: `account-password` — Password chosen, a made-up password typed twice, Create account, the storage step appears | "I've created my account"  |                        |
| 4.4b | do      | Leave **Passkey** selected, click **Create account**, and follow your device's prompt.                                   | still: fresco1.png, Passkey then Create account ⁵                                                                       | "I've created my account"  |                        |
| 4.5  | explain | Save your sign-in details somewhere safe. Fresco has no email password reset.                                            | scene: your details slide into a safe, the door locks; "NO RESET" badge                                                 | "I've saved them"          | Accounts & security    |

⁵ Not a capture: the passkey prompt is drawn by the browser and operating system, outside the page, so a recording would show nothing the reader sees.

### 5. Connect storage · guide: #configure-storage (`storage`)

Storage is connected and Fresco is on its Import Protocols step.

| #   | Type   | On-screen text                                                        | Visual                              | Advances when                                        | Guide link |
| --- | ------ | --------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------- | ---------- |
| 4.6 | choose | Where should Fresco store your study's files? You can't switch later. | still: fresco2.png, the two options | **UploadThing (recommended)** / **My own S3 bucket** |            |

#### UploadThing branch (`storage = uploadthing`) · guide: #create-a-storage-bucket-using-uploadthing

| #    | Type    | On-screen text                                                                                    | Visual                                                                                              | Advances when          |
| ---- | ------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------- |
| 4.7  | explain | UploadThing stores your study's files. You'll create a free account and copy one key into Fresco. | scene: a key travels from UploadThing into Fresco; files fly into the UploadThing folder            | Continue               |
| 4.8  | do      | In a new tab, go to [uploadthing.com](https://uploadthing.com/) and click **Get started**.        | still: uploadthing1.png, Get started                                                                | "I've clicked it"      |
| 4.9  | do      | Click **Sign In with GitHub**.                                                                    | still: uploadthing2.png, Sign In with GitHub                                                        | "I've clicked it"      |
| 4.9b | do      | GitHub asks you to allow UploadThing. Click **Authorize pingdotgg**.                              | still: uploadthing3.png, Authorize pingdotgg ⁶                                                      | "I'm signed in"        |
| 4.10 | do      | On your dashboard, click **Create a new app**.                                                    | still: uploadthing4.png, Create a new app                                                           | "I've clicked it"      |
| 4.11 | do      | Type an **App Name** and click **Create App**. Leave the region as it is.                         | still: uploadthing5.png, App Name then Create App                                                   | "I've created the app" |
| 4.12 | do      | Open **API Keys** in the sidebar, then click **Copy**.                                            | still: uploadthing6.png, API Keys then Copy                                                         | "I've copied it"       |
| 4.13 | do      | Back in Fresco, paste it into **UPLOADTHING_TOKEN** and click **Save and continue**.              | capture: `storage-uploadthing` — a made-up token pasted, Save and continue clicked, Fresco saving ⁷ | "I've saved it"        |

⁶ "pingdotgg" is UploadThing's GitHub app name. The guide names it, so the walkthrough does too, with no reassurance added.
⁷ The clip ends while Fresco saves: it checks the token with UploadThing, which a made-up token fails (judgment call 7).

#### S3 branch (`storage = s3`) · guide: #use-an-s3-compatible-bucket

| #    | Type | On-screen text                                                                                             | Visual                                                                                                       | Advances when          |
| ---- | ---- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| 4.S1 | do   | Have your bucket ready, with an access key that can read and write, and CORS allowing your Fresco address. | scene: Bucket, Access key and CORS tiles are each ticked and connect to Fresco                               | "I have these"         |
| 4.S2 | do   | Choose **S3 / S3-Compatible**, then fill in each field from your storage provider.                         | capture: `storage-s3` — S3 chosen, made-up values pasted into each field, the pointer on Save and continue ⁸ | "I've filled them in"  |
| 4.S3 | do   | Click **Save and continue**. Fresco checks the connection before moving on.                                | still: configure-storage-s3.png                                                                              | "I'm on the next step" |

⁸ The values are made up (`fresco-demo-study` on AWS), so the clip stops before saving; the local Garage store cannot stand in, because Fresco refuses a loopback endpoint (judgment call 7). Field-by-field help is left to the guide.
4.S1 mentions CORS without defining it; acceptable only because this branch is for readers who already have S3 storage.

### 6. Finish setup · guide: #upload-a-protocol (`finish`)

Setup is complete and they are on their Fresco dashboard, knowing where to turn analytics off.

| #    | Type    | On-screen text                                                                                                                              | Visual                                                                                               | Advances when                             | Guide link    |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------- |
| 5.1  | choose  | Do you have a protocol file (**.netcanvas**) to upload now? You can always upload one later.                                                | still: fresco3.png, whole screen                                                                     | **Yes** / **Not yet**                     |               |
| 5.2a | do      | Drag your **.netcanvas** file onto the box, or click **Browse files**. When **Protocol imported successfully** appears, click **Continue**. | capture: `upload-protocol` — Browse files, the sample protocol imports, the message closes, Continue | "I've uploaded it"                        |               |
| 5.2b | do      | Click **Continue**.                                                                                                                         | still: fresco3.png, Continue                                                                         | "I've continued"                          |               |
| 5.3  | do      | Click **Go to the dashboard!**                                                                                                              | capture: `finish` — Go to the dashboard! clicked, the dashboard opens                                | "I'm on the dashboard"                    | #finish-setup |
| 5.4  | explain | Fresco sends anonymous usage data by default. To turn it off, open **Settings** and turn on **Disable Analytics**.                          | still: settings-page.png, Settings in the menu then Privacy in the page contents                     | Continue                                  | #finish-setup |
| 5.5  | finish  | Fresco is running. Next, add participants and set up recruitment from your dashboard.                                                       | scene: the Fresco dashboard fills in; confetti; LIVE badge                                           | Close / Using Fresco, Accounts & security |               |

The 5.2a capture uses `public/protocols/Sample Protocol v5.netcanvas` on a local Fresco with Garage storage, whose upload screens look the same as a deployed instance's.

## Captures

`capture.ts` records each clip from a local Fresco on a fresh database, driving every step and drawing the /updates cursor into the page. Three runs, each against a newly reset database:

| Run           | Fresco storage                                                   | Clips                                                         |
| ------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `uploadthing` | not configured (`STORAGE_PROVIDER` and `S3_*` blank)             | `account-username`, `account-password`, `storage-uploadthing` |
| `s3`          | not configured                                                   | `storage-s3`                                                  |
| `protocol`    | the local Garage store (`.env.development`, `scripts/dev-s3.ts`) | `upload-protocol`, `finish`                                   |

Each clip is written as WebM, MP4, and a final-frame JPEG (shown instead of the clip with reduced motion) to `public/assets/walkthroughs/fresco-deployment/`. Every value typed is made up.

## Plain-language pass

Reread as the reader in the brief:

1. _Could they do every do beat without the guide?_ Yes, with one by design: 4.S1 assumes S3 knowledge.
2. _Is every term known, on screen, or defined earlier?_ "Environment variables" appears only inside Netlify's labels. "Token" appears only as Fresco's **UPLOADTHING_TOKEN** label; 4.7 says "key", matching UploadThing's **API Keys**.
3. _Does every explain beat change what they do next?_ 0.1, 1.1, 2.1, 3.1 and 4.7 orient the reader to each service, each under 20 words. 0.2 sets the one-sitting expectation; 3.10 and 4.5 prevent the two mistakes that cost a restart; 5.4 leads some readers to change a setting.
4. _Every article section in the coverage map, every omit or link out with a reason?_ Yes.
5. _Does the walkthrough state anything the article doesn't?_ 3.12's "you opened the wrong address" paraphrases the troubleshooting article. Everything else the walkthrough adds is now in the guide (see _Guide changes_).
