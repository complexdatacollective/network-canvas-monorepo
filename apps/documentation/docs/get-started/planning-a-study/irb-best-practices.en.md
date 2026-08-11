---
title: IRB and Security Best Practices
navOrder: 2
---

We recognize that data security is a primary concern for most researchers. Network Canvas was born in the context of sensitive public health research with marginalized populations, and we have used our experience conducting studies in this space to guide our security paradigm.

Network Canvas uses modern security features, and has built on existing technologies and widely used implementations. Across all of our tools, **the Network Canvas team never receives, transmits, or stores any participant data**. We do not act as a Data Controller or Data Processor — researchers retain full control of, and responsibility for, their study data at all times.

How that data is stored, and therefore what security measures you need to put in place, depends on which tool you use:

- **Local-device apps (Architect, Architect Classic, Interviewer, and Interviewer Classic)** — data is stored only on the local device: in the browser for the browser-based Architect and Interviewer, or within the app for the Classic desktop and tablet apps. Security relies on protecting that device.
- **Fresco (self-hosted web app)** — data is stored centrally in a database and storage that you deploy and host. Security relies on protecting that server infrastructure.

<TipBox>

This page summarizes the practical best practices for each tool. For a comprehensive deep dive — including roles under GDPR, ethics committee and IT department guidance, and a full security checklist — see our [GDPR Compliance Guide](/en/get-started/planning-a-study/gdpr-compliance).

</TipBox>

## Local-device apps (Architect, Architect Classic, Interviewer, and Interviewer Classic)

<TipBox>

**Interviewer Classic** is fully offline. **Interviewer** stores interview data locally in the same way, but some schema-8 interfaces (e.g. [Geospatial](/en/design-protocols/interface-documentation/geospatial)) require an internet connection and contact third-party services during the interview — factor this into your risk assessment if you use them.

</TipBox>

Interviewer Classic and Architect Classic are fully offline tools designed to run on researcher-controlled devices, and the browser-based Interviewer stores its data on the device in the same way. Our data security approach for these apps focuses on data transfer, since we work on the assumption that the devices running them will be fully controlled by researchers. This means that **data transfer (exporting data off the device) is the most vulnerable step in the workflow.**

### Data storage

The data collected in the field is yours, and is only ever stored on your devices. We never receive, transmit, or store participant data, and no participant data leaves the device unless you manually export it. Interviewer sends optional anonymous usage and error analytics — never participant data — which are on by default and can be disabled at any time in Settings → Privacy; Interviewer Classic sends none. We do not use cookies or other tracking tokens of any kind within Network Canvas.

### What data is stored where

When assessing risk, it helps to know exactly what these apps keep on the device. Each stores three kinds of data, all of which should be treated as potentially sensitive:

- **Protocols** — alongside the structure of your interview, a protocol can embed any datasets needed to conduct it. For example, a study in a school may include a roster of the names of classmates.
- **Session data** — participant response data, which may include sensitive personal information (especially in domains such as healthcare), plus metadata such as the date a session was conducted, which may reveal participant whereabouts.
- **App configuration and metadata** — application settings and protocol metadata, such as display preferences in Interviewer Classic or which protocol was last edited in Architect Classic.

Where this data lives differs by app generation. The browser-based **Architect** and **Interviewer** store their data in your web browser's local storage on the device you use, while **Architect Classic** and **Interviewer Classic** store their data within the app on the device. In both cases, the device-level protections described below — disk encryption, strong passwords, and automatic locking — are what keep this data safe. For information about data storage and security in Fresco, see the [Fresco FAQ](/en/collect-data/fresco/faq#is-fresco-gdpr-compliant) and the Fresco section below.

### Security best practices

Since the onus of data storage and device security is on the researcher, we suggest the following best practices to ensure the security of your Network Canvas study data:

- **Turn on full-disk encryption (OS).** Whichever app you use, enable FileVault (macOS), BitLocker / Device encryption (Windows), or your platform's equivalent. Interviewer Classic and Architect Classic do not encrypt their data stores, so device encryption is their only protection at rest. Interviewer additionally encrypts its on-device data at rest when you set up an app lock, keyed to the same authentication that unlocks the app — treat this as defense in depth, not a substitute for device encryption.
- **Use strong passwords/passcodes on devices.** Implement user access controls to prevent multi-user systems from granting access to data from other user accounts.
- **Restrict physical access to devices.** The use of 'kiosk' modes (or similar), along with full constant supervision of the interview, prevents research participants from accessing data within the app.
- **Minimize time study data remains on field devices.** Uploading data to designated secured storage locations as regularly as possible, and then deleting it from field devices, helps limit risk of breach (e.g. a device being stolen).

## Fresco (self-hosted web app)

Fresco brings Network Canvas interviews to the web browser. Participants complete interviews by visiting a URL, and you manage the study through a web-based dashboard secured with a login. Because **data lives on a server reachable over the internet rather than only on a local device**, the security considerations differ from the desktop apps — server and database security, access controls on the dashboard, and your hosting choices all matter.

### Data storage

You deploy and host Fresco on your own infrastructure, and all participant data remains under your control at all times. The Network Canvas team does not host any data and is neither Data Controller nor Data Processor.

- **Interview data** is stored centrally in a **Postgres** database (encrypted at rest when using providers like Neon, which also offers EU hosting regions, encryption in transit via TLS, automatic backups, and Data Processing Agreements).
- **Study assets** (e.g. introduction videos, images, logos, and roster files) are stored in an **S3-compatible object store**. You can use **UploadThing** (a hosted S3 wrapper, easiest to set up) or point Fresco at any S3-compatible endpoint such as **AWS S3, self-hosted MinIO, Cloudflare R2, or Backblaze B2**. Access is controlled through signed URLs, and server-side encryption is enforced or provider-default on the supported backends. Note that Fresco does not collect media uploaded by participants — the asset store holds only researcher-supplied materials.
- **Dashboard authentication** supports multiple administrator accounts, TOTP two-factor authentication, WebAuthn/passkeys, recovery codes, and login rate-limiting. Participant interview URLs are unauthenticated and protected by their unguessability; layer SSO/IdP protection externally if your IRB requires stronger participant authentication.
- **GDPR-compliant hosting** is possible by selecting an EU region for both the database and the object store (an EU S3 bucket, an EU-region UploadThing paid plan, or a fully self-hosted deployment within your jurisdiction).
- **Analytics** are optional, anonymous, contain no participant data, and can be disabled in Fresco settings.
- **Fully self-hostable.** With an S3-compatible backend, every component (app, Postgres, object store) can run inside your own infrastructure with no required external dependency. Fresco is **not** HIPAA-certified — review with your compliance team before using it for HIPAA-regulated data.

### Security best practices

As the Data Controller, you are responsible for:

- **Establishing a lawful basis** for processing participant data.
- **Choosing GDPR-compliant hosting regions** for both your Postgres database and your UploadThing/S3 storage.
- **Implementing appropriate data security measures** — use HTTPS (enforced automatically), keep the platform and dependencies updated, use strong, unique credentials for the admin dashboard, restrict database access to the application, and enable encryption at rest and in transit.
- **Maintaining data retention and deletion policies**, and securely backing up your database.
- **Enabling participant rights** (access, rectification, erasure).

<TipBox>

If you are working with your institution's IT, sysadmin, or information security team on a Fresco deployment, point them to the [FAQ for IT Departments](/en/collect-data/fresco/it-faq), which covers infrastructure requirements, encryption, authentication, network access, logging, and the application's security posture in detail. For more on data storage and security in general, see the [Fresco FAQ](/en/collect-data/fresco/faq#is-fresco-gdpr-compliant). For comprehensive, step-by-step compliance guidance, see the [GDPR Compliance Guide](/en/get-started/planning-a-study/gdpr-compliance).

</TipBox>
