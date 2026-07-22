---
title: The Protocol File
navOrder: 1
---

<Definition>

A file with the extension .netcanvas that represents your interview protocol and contains all data and assets used by it.

</Definition>

## Details

A Network Canvas protocol is stored as a `.netcanvas` file — a self-contained copy of your protocol and everything it uses. How that file relates to the copy you are working on depends on which version of Architect you use:

- In **Architect** (the browser app), your protocol lives in an in-browser **library** while you work. To get a `.netcanvas` file — to back it up, move it, or deploy it — you **Download** it from the protocol overview screen.
- In **Architect Classic** (the desktop app), your protocol _is_ a `.netcanvas` file on your computer. It behaves just like any other file: you can move it around, rename it, and you can (and should!) back it up.

Either way, the `.netcanvas` file contains all the data in your protocol. So if you use any [resources](/en/design-protocols/key-concepts/resources), such as roster data, images, or video, these will be embedded within the file. See [Saving and backing up](/en/design-protocols/saving-and-backing-up) for how each version stores your work and how to keep it safe.

## Authoring Protocol Files

Architect creates your protocol for you when you start a new one. In **Architect** (the browser app), your changes are saved automatically to the browser library as you work — there is no Save button, and you **Download** a `.netcanvas` file when you want a copy. In **Architect Classic**, Architect creates the `.netcanvas` file and prompts you to save your changes as you add stages, edit content, or upload resources. Either way, your changes are stored within the protocol.

Once you deploy your protocol to other applications, however, be aware that making changes effectively makes your protocol a new version. If you find that you need to make changes after deploying it, you have two options. It is recommended to save a copy of your protocol with a new name after making changes, and to import the new version to Interviewer. The other option is to remove the existing protocol (and any interview data) from Interviewer or Fresco and upload the newer version. This is necessary to ensure compatibility across tools.

If you choose to create or edit a protocol file by hand, you will be responsible for ensuring it follows all specifications for the current [schema](/en/get-started/advanced-topics/protocol-schema-information).

## Using Protocol Files

Once your protocol file is complete, you can then use this file in Interviewer or Fresco.

- **Interviewer**: See our [Protocol and Data Workflows Tutorial](/en/collect-data/protocol-and-data-workflows) for more information about protocol workflows in Interviewer.
- **Fresco**: See [Using Fresco](/en/collect-data/fresco/using-fresco#uploading-protocols) for more information about uploading protocols in Fresco.
