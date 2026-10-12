---
'@codaco/documentation': patch
---

The Fresco self-hosting guides now describe Garage as the storage bundled with the Docker deployment, in place of MinIO. The Advanced Deployment guide explains how to generate the two Garage values for your `.env`, which configure both Garage and Fresco's storage, and the Docker versions the bundled configuration needs. The FAQ for IT Departments now explains how to encrypt the bundled storage at rest. The guide also explains how to replace the storage access key. It warns deployments that already run the bundled MinIO that switching compose files does not move their files to Garage.
