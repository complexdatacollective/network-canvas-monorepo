---
'@codaco/studio-api': minor
---

Studio can now keep its assets in Azure Blob Storage as well as in any
S3-compatible store. A new `STUDIO_OBJECT_STORE` variable names which: `s3` or
`azure-blob`. Left unset, Studio runs with no object store, and any `S3_*` or
`AZURE_*` variable set without it is refused at boot; `.env.example` ships with
`s3`.

An Azure deployment names its container with `AZURE_STORAGE_CONTAINER` and its
storage account with `AZURE_STORAGE_ACCOUNT_URL`, and signs in as the managed
identity of the machine it runs on, so no account key is needed. Give that
identity the Storage Blob Data Contributor role on the one container, and set
`AZURE_CLIENT_ID` if it is a user-assigned identity. A host outside Azure can
use `AZURE_STORAGE_CONNECTION_STRING` instead. Studio never creates the
container; it must already exist.

A mixed or incomplete configuration is refused at boot: any `S3_*` variable
beside `azure-blob`, any `AZURE_*` variable beside `s3`, a missing container,
or both an account URL and a connection string. `/readyz` names the object
store as failing when the bucket or container cannot be reached, whichever
kind it is, and assets are stored under the same content-addressed keys either
way.

The compose stack passes the new variables through from `.env`, only points
`S3_ENDPOINT` at its own Garage while an S3 access key is set, and bootstraps
that Garage only for `s3`, so an Azure deployment that empties the `S3_*`
values gets no S3 configuration at all. The self-host guide has a new "Azure Blob Storage" section on the swap
page, and the requirements page now sets out what any object store must
provide.
