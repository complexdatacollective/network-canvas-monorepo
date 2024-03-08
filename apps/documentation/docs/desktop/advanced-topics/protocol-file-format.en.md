---
title: Protocol File Format
---

## Summary

Network Canvas uses protocol files in order to structure the interview. These are self-contained files that include the flow of the interview as well as additional assets (such as rosters, images, or scripts). A protocol file is typically built in Network Canvas Architect. Once the researcher is happy with the protocol, it can be loaded into another Network Canvas program (typically Interviewer) where the researcher can conduct their study.

## Introduction

Network Canvas is a suite of apps designed for the collection of self-reported social network data. In order to conduct a specialised study, a researcher will usually design a protocol and then deploy it.

The protocol has a `.netcanvas` extension. It also references a schema. The schema dictates what sort of details we can put in the protocol. As our schemas get more complicated, we usually ask researchers to either stay on their current version of the app during a study or to carefully upgrade their protocol so they can make use of the latest schema.

## Protocols and Schemas

Schemas are designed by the Network Canvas developement team in response to the expectation of new features that cannot be accommodated in the previous version.

## Internals of a protocol file

A protocol file is not actually a file in the traditional sense. It is actually a folder of files. This folder is then zipped up. The zipped folder has a `.netcanvas` extension so you can treat it as a single file. However, you can rename it to `.zip` and then unzip the file to see the contents of the protocol, including any images, JavaSCript, or rosters that were included alongside the instructions in the protocol for organising the stages, prompts, and logic that go into a Network Canvas interview. This detail is important if you want to use [Custom Note Labels](/en/desktop/reference/node-labelling/). You will need to unzip the file, add or replace the `nodLabelWorker.js` file in the top-level directory in the protocol. That is place the `nodeLabelWorker.js` in the same folder as (next to `protocol.json`), zip up the protocol and then rename to `.netcanvas` and you should be able to import it into Network Canvas Interviewer straight away. Note that if you then edit this in Architect, it will preserve the JavaSCript file when you save the protocol again.
