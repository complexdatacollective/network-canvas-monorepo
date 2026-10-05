---
'@codaco/architect': patch
'@codaco/interviewer': patch
---

Analytics and error reporting now run entirely from code shipped inside the app. The PostHog relay is contacted only for data: the app's Content Security Policy no longer allows it, or any other remote origin, to supply scripts.
