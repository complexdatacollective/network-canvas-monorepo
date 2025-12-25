---
title: Frequently Asked Questions
wip: false
toc: true
navOrder: 5
---

This page contains answers to frequently asked questions about the Network Canvas project. For questions specific to the desktop applications (Architect and Interviewer), please see the [Desktop FAQ](/en/desktop/project-information/faq).

## What is Network Canvas?

Network Canvas is a suite of three applications designed to assist researchers in the collection of social network data. These applications are: Architect for building interview protocols, Interviewer for use in the field to collect data, and [Fresco](/en/fresco) for deploying protocols in the web browser.

We have designed our software to overcome a few distinct barriers to social network data collection:

1. The act of collecting self-reported data is often dull and tedious. Our software is built with an emphasis on user experience, and has been rated highly in usability and satisfaction [testing](https://doi.org/10.1145/2858036.2858368).
2. There is not enough consistency or capacity for reproducibility across social network data collection. Having reusable, road-tested, and easy to implement instruments in our Architect software should help researchers to begin to standardize and improve the quality and impact of their research.
3. Managing incoming network data and preparing it for statistical analysis is too difficult. Our Interviewer app will export data in formats that work with most common social network analysis applications and workflows.

## When can I use the tools in the Network Canvas suite?

Network Canvas has been in development since 2016, with extensive alpha and beta phases. We are happy to report that we released the first stable versions of the software in December 2020. We believe the software is now ready for use in your research.

Throughout the remaining duration of our funding we will be working through a backlog of missing features, improvements, and bug fixes. These will be released as updates, and you will receive a notification within the software when they are available.

## How much does the software cost? What is your funding model?

The Network Canvas suite is free! It is licensed under the GPLv3 open source license. The project team has a strong ideological commitment to producing high quality free academic software for the benefit of researchers, students, and any other interested parties. We were funded to produce this software via [a grant from the National Institutes for Health](https://reporter.nih.gov/search/My1lXoKhnEyzXX5kIyl7Mw/project-details/9306043), for which we are extremely grateful.

Our license means that you are free to use, modify, and extend the software however you wish. It is our intention to foster a community to support the ongoing development of these tools, and we welcome collaboration. If you do extend or improve the software, we welcome contributions back into our main [GitHub repositories](https://github.com/complexdatacollective) in the form of pull requests.

We can also provide development and consultancy services to support ideas you have for developing the software to support specific features or research projects. Please create a post on our [user community](https://community.networkcanvas.com) to discuss your ideas further.

## Who is developing the Network Canvas suite?

The software is being developed by a team of researchers and developers based at Northwestern University and the University of Oxford, as well as several external contracted developers. We are grateful to be funded through a grant from the [National Institutes of Health](https://reporter.nih.gov/search/My1lXoKhnEyzXX5kIyl7Mw/project-details/9306043).

The intellectual property and copyright associated with the software is controlled by a registered not-for-profit, the Complex Data Collective, comprising the core project staff.

## I don't have any technical knowledge. Can I still use the Network Canvas suite?

Our tools are designed to be used by all social network researchers, regardless of technical expertise. Our goal is to make the software usable for anyone who has everyday computing knowledge, such as would be required to use a laptop or iPad.

The Network Canvas suite provides an end-to-end workflow, taking you from designing your interview to collating and exporting the data in a format that you are used to working with. Our central aim is to simplify this process, and lower the technical barriers to conducting personal networks research.

Finally, we intend to run demonstrations and training sessions at many network analysis conferences in the near future. In addition, our website will be a hub for training material, including videos and documentation. We hope you find these useful. If not, please let us know and we will try to improve as best we can!

## My participants have special language or literacy requirements. Can I still use Network Canvas?

Network Canvas has technologies built in to allow research with mixed/low written literacy groups, and we welcome feedback about ways we can adapt the software to new research populations and make it more accessible.

Unfortunately we do not have specific support for screen readers, or right-to-left languages at present.

## How do I cite the Network Canvas suite of tools in a paper or grant application?

Please see our page on [citing the software](./citing-the-software).

## Does the software support feature X?

Perhaps! As our work progresses, we encourage interested parties to browse the documentation and tutorials that are available through this website, and to explore the software themselves.

The software has been built to allow it to be extended and improved by anyone with web development skills. We encourage users to experiment with implementing new functionality, and contributing it back to the project. Please [get in touch](mailto:info@networkcanvas.com) if you wish to discuss commissioning the development of specific functionality for your study.

## Is Interviewer GDPR compliant?

Fresco and Interviewer are software tools that can be used in a GDPR-compliant manner, but compliance depends entirely on how you deploy and configure them. The Network Canvas development team does **not** host any participant data and does **not** act as a Data Controller or Data Processor under GDPR.

**For Interviewer (Desktop/Tablet App):**
- All participant data is stored only on your local device
- No participant data is transmitted externally unless you manually export it
- The app does not collect analytics or crash logs
- Device-level protections (disk encryption, access controls) are your responsibility

**For Fresco (Self-Hosted Web Application):**
- You deploy and host Fresco on your own infrastructure
- All participant data remains under your control at all times
- Interview data is stored in Postgres (encrypted at rest when using providers like Neon)
- Study assets are stored in S3 via UploadThing (server-side encryption enforced)
- GDPR-compliant hosting is possible when selecting an EU region (available on paid UploadThing plans)
- Optional anonymous usage/error analytics can be disabled

**Your Responsibilities:**
As the Data Controller, you are responsible for:
- Establishing a lawful basis for processing participant data
- Selecting GDPR-compliant hosting regions
- Implementing appropriate data security measures
- Maintaining data retention and deletion policies
- Enabling participant rights (access, rectification, erasure)

**Learn More:**
For comprehensive guidance on GDPR compliance, including detailed information for researchers, ethics committees, and IT departments, see our [GDPR Compliance Guide](/en/project/project-information/gdpr-compliance).
