---
title: Frequently Asked Questions
wip: false
has_children: false
toc: true
nav_order: 5
---

## What is Network Canvas?

Network Canvas is a suite of three applications designed to assist researchers in the collection of social network data. These applications are: Architect for building interview protocols, Interviewer for use in the field to collect data, and Server for managing data.

We have designed our software to overcome a few distinct barriers to social network data collection:

1. The act of collecting self-reported data is often dull and tedious. Our software is built with an emphasis on user experience, and has been rated highly in usability and satisfaction [testing](http://dl.acm.org/citation.cfm?id=2858368).
2. There is not enough consistency or capacity for reproducibility across social network data collection. Having reusable, road-tested, and easy to implement instruments in our Architect software should help researchers to begin to standardize and improve the quality and impact of their research.
3. Managing incoming network data and preparing it for statistical analysis is too difficult. Our Server app will securely store and export data in formats that work with most common social network analysis applications and workflows.

## When can I use the tools in the Network Canvas suite?

Network Canvas has been in development since 2016, with extensive alpha and beta phases. We are happy to report that we released the first stable versions of the software in December 2020. We believe the software is now ready for use in your research.

Throughout the remaining duration of our funding we will be working through a backlog of missing features, improvements, and bug fixes. These will be released as updates, and you will receive a notification within the software when they are available.

## How much does the software cost? What is your funding model?

The Network Canvas suite is free! It is licensed under the GPLv3 open source license. The project team has a strong ideological commitment to producing high quality free academic software for the benefit of researchers, students, and any other interested parties. We were funded to produce this software via [a grant from the National Institutes for Health](https://projectreporter.nih.gov/project_info_description.cfm?aid=9306043&icde=35540823&ddparam=&ddvalue=&ddsub=&cr=1&csb=default&cs=ASC&pball=), for which we are extremely grateful.

Our license means that you are free to use, modify, and extend the software however you wish. It is our intention to foster a community to support the ongoing development of these tools, and we welcome collaboration. If you do extend or improve the software, we welcome contributions back into our main [GitHub repositories](https://github.com/complexdatacollective) in the form of pull requests.

We can also provide development and consultancy services to support ideas you have for developing the software to support specific features or research projects. Please create a post on our [user community](https://community.networkcanvas.com) to discuss your ideas further.

## Who is developing the Network Canvas suite?

The software is being developed by a team of researchers and developers based at Northwestern University and the University of Oxford, as well as several external contracted developers. We are grateful to be funded through a grant from the [National Institutes of Health](https://projectreporter.nih.gov/project_info_description.cfm?aid=9306043&icde=35540823&ddparam=&ddvalue=&ddsub=&cr=1&csb=default&cs=ASC&pball=).

The intellectual property and copyright associated with the software is controlled by a registered not-for-profit, the Complex Data Collective, comprising the core project staff.

## I don’t have any technical knowledge. Can I still use the Network Canvas suite?

Our tools are designed to be used by all social network researchers, regardless of technical expertise. Our goal is to make the software usable for anyone who has everyday computing knowledge, such as would be required to use a laptop or iPad.

The Network Canvas suite provides an end-to-end workflow, taking you from designing your interview to collating and exporting the data in a format that you are used to working with. Our central aim is to simplify this process, and lower the technical barriers to conducting personal networks research.

Finally, we intend to run demonstrations and training sessions at many network analysis conferences in the near future. In addition, our website will be a hub for training material, including videos and documentation. We hope you find these useful. If not, please let us know and we will try to improve as best we can!

## My participants have special language or literacy requirements. Can I still use Network Canvas?

Network Canvas has technologies built in to allow research with mixed/low written literacy groups, and we welcome feedback about ways we can adapt the software to new research populations and make it more accessible.

Unfortunately we do not have specific support for screen readers, or right-to-left languages at present.

## Which hardware do I need to run the different components of the Network Canvas suite?

The Network Canvas suite consists of three applications, with each component running on a variety of platforms:

- Architect and Server are desktop apps, and will run on Windows, macOS, and Linux operating systems.
- Network Canvas is a hybrid desktop/mobile app, and will run on Windows, Mac, iOS and Android. It will work best with a touch screen device, but will also function well with a conventional computer that uses a keyboard and mouse. Specific functionality may vary by operating system.

Our development test devices have included a Samsung Chromebook Plus, iPad Pros (both 9.7" and 12.1", and the Google Pixel C tablet. We have also completed Network Canvas studies using 27 inch “all in one” touchscreen computers with positive results.

Although Network Canvas has not been tested on all possible hardware configurations, we anticipate that most mid to high-end laptop computers and tablets will be capable of running the software well. Please see our article on [choosing hardware for a study](./how-to/choosing-hardware) for more information. If you are planning data collection and have specific questions, please create a post on our [user community](https://community.networkcanvas.com).

## How do I cite the Network Canvas suite of tools in a paper or grant application?

Please see our page on [citing the software](./citing-the-software).

## Does the software support feature X?

Perhaps! As our work progresses, we encourage interested parties to browse the documentation and tutorials that are available through this website, and to explore the software themselves.

The software has been built to allow it to be extended and improved by anyone with web development skills. We encourage users to experiment with implementing new functionality, and contributing it back to the project. Please [get in touch](mailto:info@networkcanvas.com) if you wish to discuss commissioning the development of specific functionality for your study.

## My research involves sensitive data. What security features does the Network Canvas suite have to keep my data secure?

Our software was conceived in the context of research of a highly sensitive nature, so we understand that for many researchers security is of the utmost importance.

We do not transmit, collect or retain any data from or about your study. The data you collect in the field is yours, and is only ever stored on your devices. This provides a baseline level of security, but also means that a large part of the responsibility for securing devices and data falls on the researcher. Please review our articles on [configuring devices prior to starting data collection](./how-to/configuring-devices), and [IRB and security best practices](_reference/irb-best-practices) to ensure that you are aware of the most common weaknesses. You should also consult with your institutional IT or security experts.

If you wish to utilize our remote transfer functionality, we use standard encryption techniques implemented by well respected third party libraries to ensure that your data cannot be intercepted as it is sent remotely back to your laboratory or department computer. This transfer can take place on a local network within your institution for added security, or you can implement an entirely [offline workflow](./tutorials/offline-data-management-workflow) that does not require data to be transmitted. Further details of the security model we implement can be [found here](_reference/security-model).

If you have specific security requirements, please contact us to discuss how we can make our software suite compliant with your needs.
