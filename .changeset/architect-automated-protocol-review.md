---
'@codaco/architect': minor
---

Architect has a new experimental feature, **Automated Protocol Review**, which
asks an AI model to look for problems in your protocol and suggest fixes.

- A new **Experimental features** page, opened from the flask icon at the end
  of the navigation bar, is where you turn the feature on for a protocol.
  Experimental features may change or be removed at short notice.
- With it on, the Stages screen has a **Review protocol** button. The first
  time, it asks for your research questions, who takes part, how the interview
  is administered and, if you wish, a synopsis of the study. These study
  details are saved in the protocol.
- A review looks at the protocol's structure, its node and edge types,
  attributes and forms, skip logic and filters, wording, and the burden on
  participants, and lists the problems it finds, most serious first.
- You go through the problems one at a time and choose **Fix for me**, which
  changes the protocol straight away and can be undone, **I will fix this**,
  which keeps the problem on your list with a link to where it is, or
  **Dismiss**. A fix is only offered while it still fits your protocol and
  leaves it valid.
- The review and your choices are kept in your browser, beside the protocol.
  They are not part of the protocol file.
- You choose who writes each review, Anthropic or OpenAI, and the review says
  which model wrote it. The same protocol can be reviewed by both.
- A review needs an internet connection. It sends the protocol and your study
  details to a Network Canvas service, which passes them to the provider you
  chose. Images, video, audio and other resources are never sent. Nothing is
  kept by the service unless you choose to share your reviews with the Network
  Canvas team, in which case each one is kept for 90 days.
- The service is free and limited: 5 reviews an hour for each browser, and a
  daily and a monthly budget for each provider, shared by everyone who uses
  it. A provider whose budget is spent is greyed out until it starts again,
  and the other can still write your review. Architect tells you when a limit
  is reached and when you can review again.
