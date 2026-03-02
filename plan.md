Feature list:

I want to be able to mark campaigns or trade plans as watch-listed.

Acceptance criteria:
1) Watch-listed items are visually prominent on dashboard and list/detail views (star icon + consistent border/background treatment).
2) Provide short contextual dashboard/tooltip copy for watch-listed items (1–2 sentences, <=120 characters).
3) Define a reusable watch-list style set (icon, border/background classes, accessible contrast variants meeting WCAG AA).
4) Optional style variants are available for list rows, detail badges, and summary widgets, with consistent appearance across campaigns and trade plans.
5) Verification: render examples on dashboard/list/detail/summary surfaces and confirm contrast/copy requirements.

V2 should definitely include trade capabilities - mainly pulling from the brokerages. This will become a lot more valuable and let me keep track of things long term. Some other features that I need to prioritize include:

- Analytics - need to be able to tell things like profit/loss, win/loss ratio, comparison to various benchmarks
- Automatic trade execution - there may be a case where I can't set a stop-loss exactly how I want to (mainly on break of a trend line). This would give me a way to automate exiting a position in certain cases. I need to think more about this though because it's pretty poorly defined requirement
- Alerts - not necessarily sending me a notification but bringing my attention (likely on dashboard) if a certain trade is close to its stop-loss or close to some kind of other exit condition (any exit condition other than stop-loss)
