---
title: Frequently Asked Questions
wip: false
toc: true
navOrder: 5
---

## What is Network Canvas?

Network Canvas is a suite of three applications designed to assist researchers in the collection of social network data. These applications are: Architect for building interview protocols, Interviewer for use in the field to collect data, and [Fresco](/en/collect-data/fresco) for deploying protocols in the web browser.

Interviewer comes in two supported versions: the established **Interviewer Classic**, and the normal app, which is built on the same new platform as Fresco, supports schema 8, and is recommended for new studies. See [Running Interviews](/en/collect-data) for a comparison of the interview apps.

We have designed our software to overcome a few distinct barriers to social network data collection:

1. The act of collecting self-reported data is often dull and tedious. Our software is built with an emphasis on user experience, and has been rated highly in usability and satisfaction [testing](https://doi.org/10.1145/2858036.2858368).
2. There is not enough consistency or capacity for reproducibility across social network data collection. Having reusable, road-tested, and easy to implement instruments in our Architect software should help researchers to begin to standardize and improve the quality and impact of their research.
3. Managing incoming network data and preparing it for statistical analysis is too difficult. Our Interviewer app will export data in formats that work with most common social network analysis applications and workflows.

## When can I use the tools in the Network Canvas suite?

Right now! Network Canvas has been in development since 2016, and the first stable versions of the software were released in December 2020. The suite is stable, in active use, and updated regularly — you will receive a notification within the software when updates are available.

## How much does the software cost? What is your funding model?

The Network Canvas suite is free! It is licensed under the GPLv3 open source license. The project team has a strong ideological commitment to producing high quality free academic software for the benefit of researchers, students, and any other interested parties. We were funded to produce this software via [a grant from the National Institutes for Health](https://reporter.nih.gov/search/My1lXoKhnEyzXX5kIyl7Mw/project-details/9306043), for which we are extremely grateful.

Our license means that you are free to use, modify, and extend the software however you wish. It is our intention to foster a community to support the ongoing development of these tools, and we welcome collaboration. If you do extend or improve the software, we welcome contributions back into our main [GitHub repositories](https://github.com/complexdatacollective) in the form of pull requests.

We can also provide development and consultancy services to support ideas you have for developing the software to support specific features or research projects. Please create a post on our [user community](https://community.networkcanvas.com) to discuss your ideas further.

## Who is developing the Network Canvas suite?

The software is developed by a team of researchers and developers based at Northwestern University and the University of Oxford, as well as several external contracted developers.

The intellectual property and copyright associated with the software is controlled by a registered not-for-profit, the Complex Data Collective, comprising the core project staff.

## I don’t have any technical knowledge. Can I still use the Network Canvas suite?

Our tools are designed to be used by all social network researchers, regardless of technical expertise. Our goal is to make the software usable for anyone who has everyday computing knowledge, such as would be required to use a laptop or iPad.

The Network Canvas suite provides an end-to-end workflow, taking you from designing your interview to collating and exporting the data in a format that you are used to working with. Our central aim is to simplify this process, and lower the technical barriers to conducting personal networks research.

Finally, this documentation site is a hub for training material and tutorials, and our [user community](https://community.networkcanvas.com) is a great place to ask questions. We hope you find these resources useful. If not, please let us know and we will try to improve as best we can!

## My participants have special language or literacy requirements. Can I still use Network Canvas?

Network Canvas has technologies built in to allow research with mixed/low written literacy groups, and we welcome feedback about ways we can adapt the software to new research populations and make it more accessible.

Accessibility support depends on which generation of the apps you use. Interviews run in the current **Interviewer** app and in **Fresco** are built for screen-reader use and full keyboard operation. The Classic apps do not have specific screen-reader support. Right-to-left languages are not currently supported in any of the apps.

## Which hardware do I need to run the different components of the Network Canvas suite?

The Network Canvas suite consists of three applications, with each component running on a variety of platforms:

- Architect runs in your web browser — there is nothing to install. **Architect Classic**, the downloadable desktop app, runs on Windows, macOS, and Linux.
- Interviewer runs in your web browser and can be installed to a device you control as a Progressive Web App. It works best with a touch screen device, but also functions well with a conventional computer that uses a keyboard and mouse. **Interviewer Classic**, the downloadable app, runs on Windows, macOS, iOS, and Android; specific functionality may vary by operating system.
- Fresco is a web-based application. For information on supported browsers, devices, and platforms, see our [Fresco FAQ](/en/collect-data/fresco/faq#which-browsers-are-supported).

Although Network Canvas has not been tested on all possible hardware configurations, we anticipate that most mid to high-end laptop computers and tablets will be capable of running the software well. Please see our article on [choosing hardware for a study](/en/collect-data/interviewer/choosing-hardware) for more information. If you are planning data collection and have specific questions, please create a post on our [user community](https://community.networkcanvas.com).

## How do I cite the Network Canvas suite of tools in a paper or grant application?

Please see our page on [citing the software](./citing-the-software).

## Does the software support feature X?

Perhaps! We encourage interested parties to browse the documentation and tutorials that are available through this website, and to explore the software themselves.

The software has been built to allow it to be extended and improved by anyone with web development skills. We encourage users to experiment with implementing new functionality, and contributing it back to the project. Please [get in touch](mailto:info@networkcanvas.com) if you wish to discuss commissioning the development of specific functionality for your study.

## My research involves sensitive data. What security features does the Network Canvas suite have to keep my data secure?

Our software was conceived in the context of research of a highly sensitive nature, so we understand that for many researchers security is of the utmost importance.

We never receive, transmit, or store participant data. The data you collect in the field is yours, and is only ever stored on your devices. This provides a baseline level of security, but also means that a large part of the responsibility for securing devices and data falls on the researcher. Please review our articles on [configuring devices prior to starting data collection](/en/collect-data/interviewer/configuring-devices), and [IRB and security best practices](/en/get-started/planning-a-study/irb-best-practices) to ensure that you are aware of the most common weaknesses. You should also consult with your institutional IT or security experts.

If you are working in a scenario where you have access to a network connection with internet access, you can use an [online workflow](/en/collect-data/protocol-and-data-workflows#option-1-online-workflow) or you can implement an entirely [offline workflow](/en/collect-data/protocol-and-data-workflows#option-2-offline-workflow) that does not require data to be transmitted. Further details of what data each app stores, and how to keep it secure, can be found in the best practices article linked above.

If you have specific security requirements, please contact us to discuss how we can make our software suite compliant with your needs.

## Is Interviewer GDPR compliant?

Interviewer and Fresco can be used in a GDPR-compliant manner, but compliance depends on how you deploy and configure them. The Network Canvas development team never receives or hosts participant data, and does not act as a Data Controller or Data Processor under GDPR — you, or your institution, are always the Data Controller. The only information the software ever sends to us is optional anonymous usage and error analytics in Interviewer, which never include participant data (Interviewer Classic sends none).

For detailed guidance — including how each app stores data, analytics and third-party services, and your responsibilities as Data Controller — see our [GDPR Compliance Guide](/en/get-started/planning-a-study/gdpr-compliance).
