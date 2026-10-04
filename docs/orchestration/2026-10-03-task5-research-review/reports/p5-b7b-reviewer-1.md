# B7b unit review 1 (saved by the lead; structured sections kept)

- Reviewed `/home/user/task5-handoff/wt/p5-rev-b7b` at `8edec7e`; unit commit `b010a3b` (the lead's launch message named a wrong placeholder "85b..."); tree clean. No S1/S2.
- F1 (S3): `ResearchPanel.tsx:176` an automatic `setError` replaces a purge refusal (history purge refused, then a collecting job turns collected and `profile.list` fails: only "Model profiles are unavailable now." remains; scratch test E); the refusal shows at the top, far from the history row.
- F2 (S3): `research-text.ts:100` "reads Unverified instead of Ready from then on" overstates on history rows (they keep "Approved review, not checked here"; scratch test D) and for failed/cancelled; untrue for a shared reviewed digest.
- F3 (S3): `research-text.ts:108` "1 kept because another job uses them" (test locks it in).
- F4 (S3): `research-text.ts:113` stray `cancelLabel =(` formatting.
- Concerns held: history rows bind their own job (`li key=job.id`; scratch B purged 'X'); a newer job taking the current slot closes the open confirmation (A); a history purge does not re-check the current job (D); double click purges once (C); no stale Ready (one React batch; old reply dropped by `alive`); a success notice never hides an error (separate elements).
- Re-run: typecheck, lint clean; 88 pass; guard removals (purge count out of the ApprovedCheck key; schema parse removed) both red.
- Not checked: main-side behaviour (no handler at `8edec7e`: NOT_IMPLEMENTED until B7a), e2e, full suite.
