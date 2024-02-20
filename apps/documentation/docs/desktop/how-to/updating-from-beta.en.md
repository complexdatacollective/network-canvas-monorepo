---
title: Updating from Beta to the Stable Release
toc: true
---

If you are currently using beta versions of our software, you may have seen a notice informing you that they are no longer supported. Going forward, we will only be providing support and updates for the stable versions of our software. This is because we made several important changes that cannot easily be back-ported.

In order to avoid inconveniencing you, we made the decision to release these new versions alongside the existing software, and to keep the existing software unchanged, so that you can continue to use it for any in-progress data collection that might be underway.

**PLEASE NOTE: it will not be possible to migrate data from the beta versions of Server or Network Canvas to the stable versions.**

Because of this, you should conclude any research and export all the data you require from both Server and Network Canvas before uninstalling the beta versions, and installing the stable versions. Protocols you have authored in Architect can be automatically upgraded by the stable version of Architect to the new format.

## Key differences between beta and stable versions

As mentioned, we have made several important changes to the software in the last few months, following feedback and internal discussion. Please note the following key differences between the beta software, and the stable releases.

1. **The "Network Canvas" app is now called "Interviewer"**. We wanted a clear name to differentiate the Network Canvas project from the individual survey app itself, and so this seemed like a sensible choice. The app will now appear as "Network Canvas Interviewer" on your devices.
2. **Only boolean variable types can be used as additional variables on prompts**. Previously, it was possible to create additional variables on prompts that were of any of the standard Network Canvas types. While this functionality was powerful, it created complicated edge cases that we felt would have been difficult to solve cleanly. Because of this, we decided to only allow boolean variables to be used as additional attributes. Protocols that use the old system will be migrated automatically by the stable version of Architect.
3. **Variable names have stricter rules**. Previously there were very few restrictions about the naming you could use for your variables. We realized that this caused difficulties when exporting data, and so now require that variable names conform to the XML `NKTOKEN` format. In common-sense terms this means that not all characters can be used, variables must not contain spaces, and variables cannot start with certain characters. Protocols using the more permissive variable naming will be automatically upgraded by the stable version of Architect.
4. **The app user interfaces have been significantly redesigned**. All three apps in the suite have undergone significant design revisions since the beta period, and while these changes may be confusing at first, we hope you will quickly find them more intuitive. It is important to note that the interview experience for participants is **not** significantly altered, so we believe that there should be no data quality issues relating to this change.
5. **Data export formats are considerably different**. The data export functionality available during the beta contained many eccentricities, and several mistakes that could lead to missing data. The software also lacked a means to export ego-level data reliably. The data export functionality has been completely revamped for the stable release, which required many aspects of the data format to change. Our new formats contain meta data, ego level data, and are more compatible with other software. You will however need to update any data management processes to the new format.

## Update process

1. When you are **absolutely certain** that you have exported all data you require from Network Canvas and Server, and you have your protocol files saved to a location you can remember, please uninstall the existing applications. Windows users who do not know how to uninstall software should consult this [Microsoft support article](https://support.microsoft.com/en-gb/help/4028054/windows-10-repair-or-remove-programs). MacOS users can find the same information in [this Apple support article](https://support.apple.com/en-gb/HT202235). For iPadOS users, information on removing apps can be [found here](https://support.apple.com/en-gb/HT207618), and Android users can find information for their devices [on this page](https://support.google.com/googleplay/answer/2521768).
2. Visit the [download page](https://networkcanvas.com/download.html) to download the installation packages for the stable version of the software.
3. (Optional) If you want to continue using a protocol file you have already authored, open it in the stable release of Architect, and it will be automatically upgraded to be compatible with the stable versions of Network Canvas and Server. You may then install it on your device running Interviewer.
4. (Optional) You can then also use your upgraded protocol in Server, as with previous versions. You will need to re-pair any devices running Interviewer that you wish to use.

## Troubleshooting

- If you encounter problems exporting your data from the beta versions of the software, please create a post on our [user community](https://community.networkcanvas.com).
