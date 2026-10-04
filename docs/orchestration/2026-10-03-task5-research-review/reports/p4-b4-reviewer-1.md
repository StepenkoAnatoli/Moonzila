# B4 unit review 1 (saved by the lead; structured sections kept)

- Reviewed `6019045` and `792e68e` in `/home/user/task5-handoff/wt/p4-rev-b4` at `54a3df1`; tree clean. No S1/S2 proposed; three S3.
- F1 (S3 proposed; lead: S2): `App.tsx:180` `openConversation` applies the `session.list` reply with no alive/project check (the list effect at `:87` has both): Open review then a project switch before the reply lets the old project's list replace the new one's. It also skips the list's `disabled={busy || scopeLoading || !!activeRun}` guard (`:212`), so it can switch conversation during an active run. Reasoned, not run.
- F2 (S3, test gap): decision 5 (`ResearchPanel.tsx:122`, Start review hidden when untrusted or research off) has no test: removing either condition leaves 47/47 green.
- F3 (S3, test gap): `jobKey` (`ResearchPanel.tsx:31`) digest part not proven: the stale test also bumps the revision.
- F4 Rejected: Start review offered after a trust change; engine refuses `TRUST_CHANGED`; renderer cannot see `trustRevision`.
- Pre-mortem all held. Builder claims re-run 75/75; typecheck, lint clean. Own guard removals: Ready on any reply -> 2 red; dangerouslySetInnerHTML -> red; lead's runMode removed -> red.
- Decisions: history label right; reader while reviewing/packaging acceptable (section 3 source, labelled not verified); Ready without digest cannot occur (`migrations.ts:252` CHECK); separate `REVIEW_PHASE_FAILURES` sound.
- Not checked: full suite, Windows, e2e, B11.
