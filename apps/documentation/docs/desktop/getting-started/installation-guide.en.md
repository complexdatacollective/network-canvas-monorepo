---
title: Installation Guide
nav_order: 3
last_modified_at: 2021-02-10
wip: false
toc: true
---

## Which applications do I need?

Each application of the Network Canvas Suite can be downloaded and installed individually. You do not need to install all applications to use the software.

- Install **Interviewer** on any device you will use to interview participants. It runs your Network Canvas protocols and collects data in the field.
- Install **Architect** on a desktop computer that you will to use to design your Network Canvas interview protocol.
- (Optionally) Install **Server** if you wish to use it as a central data storage system, or as a means to deploy interview protocols to your devices. See "do I need Server" (below) for further information.

### Do I need Server?

Server has been designed specifically for scenarios where a dedicated team member will be responsible for managing data. This team member should be prepared to work with their IT department, or else have good knowledge of computer networking principles, in order to configure Server to send and receive data securely.

Smaller studies, or extremely large studies, may benefit from working directly with data exported from Interviewer. For more information, see our tutorial on [offline data management workflows](./tutorials/offline-data-management-workflow).

## System Requirements

All three applications are supported only when running on Windows 10 (1909) or newer, macOS 10.15.4 or newer, Android 10 or newer, and iPadOS 14.2 or newer.

For desktop applications, we recommend a modern device, featuring a high resolution screen (greater than 900 pixels effective vertical resolution), ample RAM, and dedicated graphics. Performance may differ considerably depending on the power of the device that you use, and you should be aware that this can negatively impact the interview experience for your research participants, leading to poorer quality data.

You may install and run the software on devices that do not meet these criteria, but we are unfortunately unable to offer support regarding technical issues if you do.

## Windows

Visit the [download page](https://networkcanvas.com/download.html), and download the Windows version of each app you require.

Open each .exe file. You may be presented with a dialog that says the application cannot be run because it is from an unsigned publisher. This happens because our apps have not yet built up enough trust with Microsoft to automatically pass these filters. This will change as more users install our apps.

In order to continue to install the application simply click the "more info" text in the dialog. Then a "Run Anyway" button should appear. Once the application is installed it should open straight away. You should also be able to find the application in your program list from the start menu.

## macOS

Visit the [download page](https://networkcanvas.com/download.html), and download the macOS version of each app you require. These are packaged in the form of a DMG disk archive.

When you double-click on the DMG file it will open a new Finder window with the application icon and a folder representing your computer's "Applications" folder. Drag each application into the Applications folder. If you are prompted for authentication and you do not have it, you can simply drag the application to anywhere underneath your home directory.

Once the application is installed you will need to double click on the application icon to open the program.

## Linux

We provide Linux packages in a variety of formats, and for both x86 and ARM architectures. Visit the [download page](https://networkcanvas.com/download.html), and click on the link for downloading the apps you need on Linux. You will be redirected to the most recent release on GitHub, where you will find the package files themselves. Please refer to your distribution's documentation on which package formats are supported, and for specific installation instructions.

If you have difficulties installing or running these packages, please contact the project team.

**Please note that we no longer support the SNAP package format, owing to difficulties with the build process. If you are using earlier versions of the software that were distributed in this format, please update to one of the currently supported packages.**

## Android

Installation on Android devices works the same as with any other Android app. It can be found by opening the Play Store app, and searching for "Network Canvas Interviewer". Alternatively, you can visit the [Play Store website](https://play.google.com/store/apps/details?id=org.codaco.NetworkCanvasInterviewer6), and initialize the installation on your devices from there.

Please note that Interviewer requires Android version 10 or newer, and will work best with larger tablet devices (9.7"+). Installation is restricted to devices that meet these criteria.

If you cannot find Interviewer in the Play Store, it is likely because your device is not compatible. If you believe your device should be compatible and you still cannot find the app in the Play Store, please contact us.

## ChromeOS

If your ChromeOS device supports installing Android apps, you can install the Interviewer app as usual through the Google Play Store. To do this, please see the instructions above for installing the app on Android.

Please note that only Interviewer is specifically designed to work with ChromeOS, and only when run as an Android app. Running Interviewer, Architect or Server through Linux app compatibility is not supported at present.

## iOS

Interviewer is available from the [Apple App Store](https://apps.apple.com/us/app/network-canvas/id1538673677), searchable as "Network Canvas Interviewer".

Interviewer was developed on a 12.9" iPad pro, and will work best with larger iOS devices (9.7"+).
