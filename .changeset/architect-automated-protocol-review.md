---
'@codaco/architect': minor
---

Architect has a new experimental feature, **Automated Protocol Review**, which
asks an AI model to look for problems in your protocol and suggest fixes.

- A new **Experimental features** page, opened from the flask icon at the end
  of the navigation bar, is where you turn the feature on for a protocol.
  Experimental features may change or be removed at short notice.
- With it on, the Stages screen has a **Review protocol** button. Each time
  you ask for a review, it says what will be sent, then asks for a synopsis of
  your study, who takes part and how the interview is administered, and your
  research questions. Research questions are optional but recommended: without
  them the problems found are less specific. These study details are saved in
  the protocol and filled in for you the next time, to check or change.
- A review looks at the protocol's structure, its node and edge types,
  attributes and forms, skip logic and filters, wording, and the burden on
  participants, and lists the problems it finds, most serious first.
- You go through the problems one at a time and choose **Fix for me**, which
  changes the protocol straight away and can be undone, **I will fix this**,
  which keeps the problem on your list with a link to where it is, or
  **Dismiss**. A fix is only offered while it still fits your protocol and
  leaves it valid.
- **Dismiss review** removes a review when you have finished with it, so that
  you can ask for a new one.
- The review and your choices are kept in your browser, beside the protocol.
  They are not part of the protocol file.
- You choose which model writes each review: Claude Opus 5.5, made by
  Anthropic, or GPT-6.1 Sol, made by OpenAI.
- A review needs an internet connection. It sends the protocol and your study
  details to a Network Canvas service, which passes them to the provider of
  the model you chose. Images, video, audio, other resources and any API keys
  saved in the protocol are never sent. Check that your IRB or ethics review
  body permits this before you use the feature.
- **Share the results of this review with the Network Canvas team** is ticked
  unless you untick it. While it is ticked, the team keeps a copy of your
  study details, the protocol and the review for 90 days, and uses them only
  to improve this feature. Unticked, the service keeps nothing.
- The service is free and limited: 5 reviews an hour for each browser, and a
  daily and a monthly budget for each provider, shared by everyone who uses
  it. A provider whose budget is spent is greyed out until it starts again,
  and the other can still write your review. Architect tells you when a limit
  is reached and when you can review again.
