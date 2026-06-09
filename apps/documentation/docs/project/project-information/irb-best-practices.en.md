---
title: IRB and Security Best Practices
---

We recognize that data security is a primary concern for most researchers. Network Canvas was born in the context of sensitive public health research with marginalized populations, and we have used our experience conducting studies in this space to guide our security paradigm.

Network Canvas uses modern security features, and has built on existing technologies and widely used implementations. Across all of our tools, **the Network Canvas team never receives, transmits, or stores any participant data**. We do not act as a Data Controller or Data Processor — researchers retain full control of, and responsibility for, their study data at all times.

How that data is stored, and therefore what security measures you need to put in place, depends on which tool you use:

- **Desktop Suite (Interviewer & Architect Desktop)** — data is stored only on the local device. Security relies on protecting that device.
- **Fresco (self-hosted web app)** — data is stored centrally in a database and storage that you deploy and host. Security relies on protecting that server infrastructure.

<TipBox>

This page summarizes the practical best practices for each tool. For a comprehensive deep dive — including roles under GDPR, ethics committee and IT department guidance, and a full security checklist — see our [GDPR Compliance Guide](/en/project/project-information/gdpr-compliance). For a complementary technical breakdown of what data needs securing in the desktop apps, see the [Overview of Security Model](/en/project/project-information/security-model).

</TipBox>

## Desktop Suite (Interviewer & Architect Desktop)

<TipBox>

This describes **Interviewer 6.x**, which is fully offline. **Interviewer 7** (beta) stores interview data locally in the same way, but some schema-8 interfaces (e.g. [Geospatial](/en/project/interface-documentation/geospatial)) require an internet connection and contact third-party services during the interview — factor this into your risk assessment if you use them.

</TipBox>

The desktop applications are fully offline tools designed to run on researcher-controlled devices. Our data security approach for the Suite focuses on data transfer, since we work on the assumption that devices running the Suite will be fully controlled by researchers. This means that **data transfer (exporting data off the device) is the most vulnerable step in the workflow.**

### Data storage

The data collected in the field is yours, and is only ever stored on your devices. We do not transmit, collect, or retain any data from or about any study, and no participant data leaves the device unless you manually export it. Additionally, we do not use cookies or other tracking tokens of any kind within Network Canvas.

### Security best practices

Since the onus of data storage and device security is on the researcher, we suggest the following best practices to ensure the security of your Network Canvas study data:

- **Turn on full-disk encryption (OS).** Network Canvas does not encrypt its data stores, since the keys would be trivial to uncover from within the apps themselves. Use FileVault (macOS), BitLocker / Device encryption (Windows), or your platform's equivalent.
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

If you are working with your institution's IT, sysadmin, or information security team on a Fresco deployment, point them to the [FAQ for IT Departments](/en/run-interview/fresco/deployment/it-faq), which covers infrastructure requirements, encryption, authentication, network access, logging, and the application's security posture in detail. For more on data storage and security in general, see the [Fresco FAQ](/en/run-interview/fresco/faq#is-fresco-gdpr-compliant). For comprehensive, step-by-step compliance guidance, see the [GDPR Compliance Guide](/en/project/project-information/gdpr-compliance).

</TipBox>
