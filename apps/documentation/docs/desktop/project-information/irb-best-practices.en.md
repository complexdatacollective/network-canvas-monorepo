---
title: IRB and Security Best Practices
---

We recognize that data security is a primary concern for most researchers. Network Canvas was born in the context of sensitive public health research with marginalized populations, and we have used our experience conducting studies in this space to guide our security paradigm.

Network Canvas uses modern security features, and has built on existing technologies and widely used implementations. Our data security approach focuses on data transfer, since we work on the assumption that devices running the Suite will be fully controlled by researchers, and in the case of dedicated data storage devices running Server, will operate in secure networking contexts. This means that data transfer is the most vulnerable step in the workflow.

## Secure Data Transfer

Our remote transfer functionality (i.e. the workflow with Server) uses end-to-end encryption to ensure that your data cannot be intercepted by a third party as it is sent remotely back to your laboratory or department computer. This transfer can take place on a local network within your institution, for added security. Data transmitted between Network Canvas and Server are encrypted using a symmetric encryption algorithm called Advanced Encryption Standard (AES) which secures its integrity before transmission. Once the data are encrypted, they are sent securely to Server using Transport Layer Security (TLS).

## Data Storage

Where Network Canvas data is stored is up to the researcher. Server is a desktop application that facilitates secure transfer and management of study data, but it does not provide a storage solution.

We do not transmit, collect or retain any data from or about any study. The data collected in the field is yours, and is only ever stored on your devices. Additionally, we do not use cookies or other tracking tokens of any kind within Network Canvas.

## Security Best Practices

Since the onus of data storage and device security is on the researcher, we suggest the following best practices to ensure the security of your Network Canvas study data:

- **Turn on full-disk encryption (OS).** Network Canvas and Server do not encrypt their data stores, since the keys would be trivial to uncover from within the apps themselves.
- **Use strong passwords/passcodes on devices.** Implement user access controls to prevent multi-user systems from granting access to data from other user accounts.
- **Restrict physical access to devices.** The use of 'kiosk' modes (or similar), along with full constant supervision of the interview, to prevent research participants from accessing data within the app.
- **Minimize time study data remains on field devices.** Uploading data to designated secured storage locations as regularly as possible, and then deleting it from field devices, helps limit risk of breach (e.g. a device being stolen).
- **Only access Server on a local network or through a VPN.** Using VPN technology, secured ad-hoc networks, an "air gap", or other common security techniques when transferring data between field devices and Server. These technologies can often supplement the security measures already within the software. _Never expose Server to the public internet._
- **Periodically re-pair your devices.** Re-pairing allows your devices to refresh their encryption code which helps to minimize the potential for any interception.
