# Public GitHub URL reading implementation plan

Execute locally with the executing-plans workflow and behavioral regression tests.

Goal: read a user-supplied public GitHub repository URL in General chat or project chat, without cloning or credentials.

Architecture: a strict read_github tool crosses the existing engine/main broker. Only main performs HTTPS GET requests to api.github.com. Main independently derives the repository allowlist from saved user messages and revalidates active run, epoch and privacy revisions before and after requests. No database migration or new dependency. Version 0.8.0 includes the reported local-path corrections.

Design and contract:
- Input: url (HTTPS github.com repository, tree or blob URL), optional path/ref and bounded startLine/lineCount. Root URL supports repository browsing; tree/blob URLs use the first following segment as ref (refs with slashes can use the separate ref field).
- Only repositories explicitly named by a valid URL in saved user text are eligible. Model/tool output never grants scope. No automatic external link traversal, arbitrary web fetch, private-token handling, clone, writes or research authorization.
- Public unauthenticated REST requests resolve HEAD/ref to a commit SHA and fetch contents at that commit. Cache the commit per repository/ref in the run; return source URL and commit with results.
- No redirects, cookies, auth or provider credentials. Bound request duration, response bytes, file size, output lines and listing entries. Reject malformed content, binary text, links/submodules and sensitive paths. Translate status into precise public errors, with no response-body/error/secret echo.
- Remote content is untrusted data. Citation-bearing tool results persist in conversation and events. Stop, epoch loss and changed policy discard late results.
- General chat keeps zero local tools; main admits only the implemented GitHub tool when the user supplied repository scope. UI explains public GitHub support and unchanged lack of local folder access.

Tasks:
- [x] Add failing real-reader tests: root listing and file paging at a pinned commit; allowlist, redirect, cancellation, byte/size limits, rate limit, missing/private repo and malformed URL handling.
- [x] Implement shared GitHub input/parser/scope helpers and main GitHub reader with injectable fetch for protocol tests. Verify against public Moonzila without auth.
- [x] Extend strict process messages, engine host hook, main capability validation and read-only tool events; test general chat scope, rejected cross-repo calls, Stop and saved results.
- [x] Update UI capability copy, model guidance and existing local-tool errors. Add a desktop workflow using mocked public API at the network boundary, not a fake reader.
- [ ] Run typecheck, lint, full tests, build/runtime and desktop checks; package and test the Windows app. Update handoff, source evidence and release record; scan for keys; push/open PR and inspect exact-head Windows CI. User merges.

Primary API evidence (accessed 2026-10-01):
- https://docs.github.com/en/rest/repos/contents : public reads need no authentication; ref selects a commit/branch/tag; file contents use base64; directory listings are limited to 1,000 entries; links/submodules require special handling.
- https://docs.github.com/en/rest/git/trees : tree APIs can provide broader listing, but this implementation uses bounded directory-by-directory contents reads.

The token question does not authorize copying developer tokens into application settings. Public URL reading needs no token; a secure private-repository connection remains a separate feature.

Local full-suite evidence: 511 tests / 37 files passed in 279.10 seconds; typecheck and lint pass. The standalone public Moonzila read and the new Electron conversation/restart workflow passed. Final packaging/remote status are tracked in the phase PR and release record.

## CI correction

The branch run at 1c5a472 exposed a recovery-banner race despite passing PR/tag runs. Reproduce with an immediate rejected run after session creation, then move error clearing from the deferred session effect into navigation/action handlers. Ship the corrected installer as 0.8.1 / v0.8.1-dev.1, preserving the old tag. Recheck renderer tests, types/lint/build, repeated recovery desktop behavior, all packaged workflows and exact-head Windows CI before marking PR #14 ready.
