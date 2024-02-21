---

title: Overview of Security Model

---

Security is an important consideration when handling study data.

- Sessions may contain personal participant information which needs to be kept private
- Protocols may include information about participants which needs to be kept private
- Studies need to be able to ensure that collected data is genuine to ensure the integrity
of the research.

## What data needs to be secured

### Protocols

Protocols not only include the general structure of an interview but any datasets that are necessary to conduct an interview. For example a study in a school may include a roster of the names of other classmates.

### Session data

Session data is the term used to describe participant response data. This may include
sensitive personal information, especially in the domain of healthcare. The applications also
store metadata, including the date that the session was conducted which may reveal participant whereabouts.

### App configuration and metadata

Each app stores a metadata about protocols as well as application-specific settings.

In Server:

- Paired device metadata, including the device name and the device secret key
- Protocol metadata, such as when they were installed.

In Interviewer:

- Information about application display settings
- Server data, including public certificate and IP address

In Architect:

- Protocol metadata, such as which protocol was edited last.

## How data is secured

### Data at rest

The main application data stores are unencrypted at rest, this applies to:

- Protocols
- Session data
- Application configuration.

Because data stores are not encrypted it is important that operating system level security features are in use.

#### Disk encryption

Disk encryption should be enabled to ensure that data cannot be accessed if the device is lost or stolen.

In Windows this feature is called "[Device encryption](https://support.microsoft.com/en-us/windows/device-encryption-in-windows-10-ad5dcf4b-dbe0-2331-228f-7925c2a3012d)"
For macOS this feature is called "[FileVault](https://support.apple.com/en-gb/guide/mac-help/mh11785/11.0/mac/11.0)".
In android this feature is called "Full-Disk Encryption".
iOS encrypts the device by default.
For Linux, it will depend on the distribution; Ubuntu comes with out-the-box disk encryption using LUKS with LVM.

#### Secure passwords

Your device(s) should be configured with strong passwords and to lock automatically from inactivity - or
better yet should be manually locked when not in use. This is to prevent access to data when you or the user
are not present.

### Data in transit

Data transferred between Server and Interviewer is encrypted using TLS.

- Protocols: when using the "Import from Server" feature in Interviewer
- Session data: when using the "Export to Server" feature in Interviewer

Additionally, metadata is transferred between Server and Interview when pairing devices. This is done using
Secretbox from [libsodium](https://doc.libsodium.org/), using the pairing code as an "out of band" key exchange.

#### VPN

It is strongly advised that a VPN is used when using Server in tandem with Interviewer. You may be using one already
if you use a device managed by an IT department. Using a VPN will provide more comprehensive security for
the transmission of data, as although every effort has been made to ensure security between the apps, this
is much more likely to include bugs that the tried and battle tested VPN tools that already exist.
