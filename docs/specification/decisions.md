# Monnzila specification corrections

The user requested the full product under the name Monnzila. This file resolves the reviewed attachment's incomplete appendix and supersedes conflicting example contracts. The original product requirements remain in force.

1. Use one strict method registry for request and response types, owner, effect and authorization. Persist request ID/method/input hash/accepted entity/result. Include change listing, diff reading and journaled undo.
2. Project trust has its own revision. Recheck live privacy at tool/network admission; revoke trust and tombstone credentials before cancelling affected contexts. Stage vault ciphertext before committing profile references and reconcile on startup.
3. Native provider state is bound to a unique profile-revision identity including API family/endpoint/model. Provider streams emit terminal outcomes; incomplete tool calls never execute.
4. A main-owned Electron network broker binds credential destination to trusted profiles. Use system proxy and normal certificate validation; bound streams; define abort and authenticated redirect handling.
5. Read-only Git uses fixed templates, no pager, no external diff/textconv/fsmonitor, a sanitized environment and a qualified Git version.
6. Stop closes admissions first; terminal cancellation follows confirmed owned-work exit/reconciliation. Active I/O outcomes remain recorded accurately.
7. Apply project context exclusions consistently and count retries/summaries/delegations against budgets.
8. Missions distinguish produced, verifying and completed outputs. Verification binds immutable output manifests and cannot self-certify. Serialize workspace writers until isolation is qualified.
9. GPU auto-selection requires verified current telemetry; unknown free VRAM selects an eligible CPU configuration or reports unavailable. Storage relocation is staged verified copy/atomic activation, never a raw move.
10. Research uses GitHub API 2026-03-10 and returned workflow_run_id, with opaque client_ref for uncertain-response reconciliation. Verify actual packaged execution of the pinned kit and resolve redistribution rights before bundling for distribution.
11. Every evidence file has a real producer tied to tested artifacts; tiny helper tests and manually authored success JSON do not qualify the product.

12. The product name is Monnzila (user request, 2026-10-03; previously MoonAliza). The rename covers the product name, the window title, the installer product name, the package name, UI text, prompts and current documents. Kept unchanged, deliberately: the Windows app ID `com.moonaliza.desktop` and `app.setName('MoonAliza')` (they decide the installed app's identity and data directory, so changing them would strand existing installs), session partitions, IPC channel and bridge names, the native helper file name `MoonAlizaHost.exe`, the model-store and receipt identity strings, the activation signature domain string, test fixture identities, the GitHub repository name and its URLs, and the immutable handoff, research and release records. Rejected alternative: renaming the app ID and data directory in the same change, which needs a migration of installed data and a new update feed first.

Implementation status is tracked separately. None of these decisions asserts the feature is already implemented or tested.
