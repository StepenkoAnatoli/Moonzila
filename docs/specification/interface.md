# Monnzila workbench

Windows desktop interface: project/conversation sidebar, central conversation and composer, optional changes/research/details pane, bottom provider/connectivity/run status. Default 1440×960, minimum 960×640. Right pane becomes a drawer below 1180px.

Segoe UI is the interface face; Cascadia Mono/Consolas is for code. Use 14px body/21px line height for the dense desktop workbench, 12px minimum metadata and 28px empty-state heading. Left aligned content. System light/dark and high contrast are supported.

Core palette: canvas #101821, raised surface #18232e, border #334351, text #edf3f8, muted #a8bbc9, focus/action #92c9ef. Light equivalents: canvas #f4f7fa, surface #ffffff, border #c4d2dd, text #172b3a, muted #526878, action #155d88. Status colors are paired with text/icons.

The crescent-like Monnzila mark is the visual signature. Everything else favors legibility: quiet separators, distinct active selection, compact tool results, clear approval actions, persistent Stop. No marketing hero, testimonials, glowing gradients or dashboard statistic cards.

The UI/UX database's first broad match mixed an irrelevant marketing-page pattern into the result; it was discarded. A narrower product lookup matched Developer Tool / IDE, supporting the compact workbench, terminal-style activity and blue keyboard focus. Existing specification typography/layout take precedence.

Keyboard: Ctrl+N conversation, Ctrl+O project, Ctrl+K actions, Ctrl+Enter send, Escape dialogs. Dialog focus is trapped/restored. Destructive and approval controls have explicit labels. Screen readers receive summarized status updates rather than every token. Respect reduced motion and forced colors.
