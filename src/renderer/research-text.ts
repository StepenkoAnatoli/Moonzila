import type { Research } from '../shared';

/**
 * What the research panel says about a job. Every job failure in the collection spec has its own entry; anything else
 * falls back to a generic message. Research text (topics, codes) is untrusted: it is shown only as bounded plain text.
 */
export const RESEARCH_FAILURES: Readonly<Record<string, { title: string; action: string }>> = {
  PROJECT_NOT_FOUND: { title: 'Project no longer available', action: 'This project is no longer registered. Open its folder again, then start a new collection.' },
  PROJECT_UNTRUSTED: { title: 'Project not trusted', action: 'The project was not trusted when the collection was due to proceed. Trust the project again, then start a new collection.' },
  RESEARCH_NOT_ALLOWED: { title: 'Research turned off', action: 'Research was turned off for this project, so the collection stopped. Allow research in the project policy, then start a new collection.' },
  POLICY_CHANGED: { title: 'Research setting changed', action: 'The project\'s research setting changed after this collection was requested, so Moonzila stopped it. Changing only the inference setting does not stop research. A run already started on GitHub is not cancelled there. Start a new collection under the current setting.' },
  TRUST_CHANGED: { title: 'Project trust changed', action: 'The project trust changed after this collection was requested, so Moonzila stopped it. A run already started on GitHub is not cancelled there. Start a new collection once the project is trusted.' },
  COLLECTOR_NOT_CONFIGURED: { title: 'Collector not set up', action: 'No collector repository was saved. Enter the repository, workflow and branch in Collector settings, then start again. Nothing was sent to GitHub.' },
  COLLECTOR_TOKEN_MISSING: { title: 'Collector token missing', action: 'No collector token was available. Save a token with Actions read and write permission on the collector repository in Collector settings, then start again.' },
  RESEARCH_KIT_UNAVAILABLE: { title: 'Research Kit unavailable', action: 'The Research Kit is not installed or failed its integrity check. Install or repair the Research Kit, restart Moonzila, then start again. Nothing was sent to GitHub.' },
  COLLECTOR_INPUT_TOO_LONG: { title: 'Inputs too long', action: 'The topic, queries and URLs do not fit in one collector command. Shorten or remove some of them, then start again. Nothing was sent to GitHub.' },
  COLLECTOR_CHANGED: { title: 'Collector settings changed', action: 'The collector settings changed before the collection could start. Check Collector settings, then start again. Nothing was sent to GitHub.' },
  DISPATCH_NOT_STARTED: { title: 'Collector did not start', action: 'The collector could not be started after three attempts. Nothing was sent to GitHub. Start again; if it keeps failing, restart Moonzila.' },
  COLLECTOR_REFUSED: { title: 'Request refused by the Research Kit', action: 'The Research Kit refused the collection request before contacting GitHub, for example because a setting is not valid for it. Check Collector settings, then start again.' },
  COLLECTOR_NOT_FOUND: { title: 'Collector not found', action: 'GitHub could not find the collector repository, workflow or branch, or the token cannot see them. Check Collector settings and the token\'s repository access, then start again.' },
  COLLECTOR_FORBIDDEN: { title: 'Collector access refused', action: 'GitHub refused to start the workflow. Give the token Actions read and write permission on the collector repository and check that Actions is enabled there, then start again.' },
  COLLECTOR_TOKEN_REJECTED: { title: 'Collector token rejected', action: 'GitHub rejected the collector token; it may be expired or revoked. Save a new token in Collector settings, then start again.' },
  COLLECTOR_REJECTED: { title: 'Request rejected by GitHub', action: 'GitHub rejected the collection request. Check that the workflow accepts these inputs and that the branch exists, then start again.' },
  REMOTE_STATE_UNKNOWN: { title: 'Run state unknown', action: 'Moonzila could not confirm whether a collection run started on GitHub. It did not try again, so no second run was started. Check the Actions page of the collector repository before starting a new collection: a run there may still be using your collection credits.' },
  RUN_FAILED: { title: 'Collection run failed', action: 'The collection run on GitHub did not succeed. Open it on the Actions page of the collector repository to see why, then start a new collection.' },
  ARTIFACT_MISSING: { title: 'Corpus not found', action: 'The run finished without a downloadable corpus. Check the run\'s artifacts on GitHub, then start a new collection.' },
  ARTIFACT_EXPIRED: { title: 'Corpus expired', action: 'The corpus expired on GitHub before it could be downloaded; GitHub keeps it for 7 days. Start a new collection.' },
  ARTIFACT_INVALID: { title: 'Corpus failed validation', action: 'The downloaded corpus failed the Research Kit\'s validation and was not used. Start a new collection; if this repeats, check the Research Kit version in the collector repository.' },
  ARTIFACT_INCOMPLETE: { title: 'Corpus incomplete', action: 'The Research Kit reported the downloaded corpus as incomplete or blocked, and it was not used. Start a new collection, for example with a larger page budget.' },
  COLLECTION_FAILED: { title: 'Nothing could be collected', action: 'The collector ran but reported that the collection failed. Check the search and scraping secrets and credits of the collector repository, then start again.' },
  RUN_IDENTITY_MISMATCH: { title: 'Run did not match the request', action: 'The GitHub run Moonzila found is not the one it started (a different run, repository, workflow, branch or trigger), so its corpus was not used. Check the Actions page of the collector repository, then start a new collection.' },
  PACKAGE_IDENTITY_MISMATCH: { title: 'Corpus from another run', action: 'The downloaded corpus belongs to a different run, attempt or commit than the one this collection started, so it was not used. Start a new collection.' },
  COLLECTION_EXPIRED: { title: 'Collection timed out', action: 'The collection did not finish within 7 days of starting, so Moonzila stopped following it. Start a new collection.' },
  // Review failures (`not_ready`), one per REVIEW_FAILURES member in src/engine/review-contract.ts; a test keeps them in step.
  REVIEW_INTERRUPTED: { title: 'Review interrupted', action: 'Moonzila stopped while the review was running. Start the review again; it continues with the edits you already approved.' },
  REVIEW_STOPPED: { title: 'Review stopped', action: 'The review run was stopped before the Research Kit gate checked it. Start the review again when you are ready; it continues with the edits you already approved.' },
  REVIEW_RUN_FAILED: { title: 'Review run failed', action: 'The review run ended with an error; its conversation shows where. Check the model profile, then start the review again.' },
  REVIEW_BUDGET_EXCEEDED: { title: 'Review out of steps or time', action: 'The review run used its step or time budget before it finished. Start the review again to continue, or raise the run limits in settings first.' },
  REVIEW_CONTEXT_LIMIT: { title: 'Review out of context', action: 'The review no longer fits the model\'s context window. Start the review again with a model profile that has a larger context window.' },
  REVIEW_WORKSPACE_CHANGED: { title: 'Review workspace changed', action: 'The review workspace no longer matched the edits recorded for it, so it was not packaged. Start the review again; Moonzila rebuilds the workspace from the collected corpus.' },
  REVIEW_PACKAGE_BLOCKED: { title: 'Review package blocked', action: 'The Research Kit refused to package the reviewed workspace. Open the review conversation to see what it holds, then start the review again.' },
  REVIEW_PACKAGE_INVALID: { title: 'Review package invalid', action: 'The package built from the review failed the Research Kit\'s validation and was not used. Start the review again; if this repeats, check the Research Kit installation.' },
  REVIEW_PACKAGE_MISMATCH: { title: 'Review package did not match', action: 'The package built from the review did not match the reviewed workspace, so it was not used. Start the review again.' },
  REVIEW_PACKAGING_FAILED: { title: 'Review packaging failed', action: 'Moonzila could not package the reviewed workspace. Start the review again; if this repeats, restart Moonzila first.' },
  REVIEW_GATE_FAILED: { title: 'Research Kit gate failed', action: 'The Research Kit gate found open questions or unsupported claims in the reviewed workspace. Start the review again and resolve them in the review conversation.' },
  REVIEW_INCOMPLETE: { title: 'Review incomplete', action: 'The Research Kit found review steps not yet done, such as findings not rewritten or the brief\'s open sections. Start the review again and finish them in the review conversation.' },
};

/**
 * Codes a review shares with collection, worded for a review: a `not_ready` job failed in review, never in collection
 * (review spec "Vocabulary": the admission codes and RESEARCH_KIT_UNAVAILABLE).
 */
export const REVIEW_PHASE_FAILURES: Readonly<Record<string, { title: string; action: string }>> = {
  PROJECT_NOT_FOUND: { title: 'Project no longer available', action: 'This project is no longer registered, so the review stopped. Open its folder again, then start the review again.' },
  PROJECT_UNTRUSTED: { title: 'Project not trusted', action: 'The project was not trusted while the review ran, so it stopped. Trust the project again, then start the review again.' },
  RESEARCH_NOT_ALLOWED: { title: 'Research turned off', action: 'Research was turned off for this project, so the review stopped. Allow research for this project, then start the review again.' },
  POLICY_CHANGED: { title: 'Research setting changed', action: 'The project\'s research setting changed while the review ran, so Moonzila stopped it. Start the review again under the current setting.' },
  TRUST_CHANGED: { title: 'Project trust changed', action: 'The project trust changed while the review ran, so Moonzila stopped it. Start the review again once the project is trusted.' },
  RESEARCH_KIT_UNAVAILABLE: { title: 'Research Kit unavailable', action: 'The Research Kit is not installed or failed its integrity check, so the review could not be packaged. Install or repair the Research Kit, restart Moonzila, then start the review again.' },
};

const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
/**
 * An unlisted failure is still actionable; its code is shown only when it has the code shape. A `not_ready` job failed
 * in review, so codes shared with collection get their review wording there.
 */
export function failureText(code: string, status?: Research['status']): { title: string; action: string } {
  const shown = CODE.test(code) ? ` (${code})` : '';
  if (status === 'not_ready') return REVIEW_PHASE_FAILURES[code] ?? RESEARCH_FAILURES[code] ?? { title: 'Review not ready', action: `The review stopped${shown}. Start the review again.` };
  return RESEARCH_FAILURES[code] ?? { title: 'Collection failed', action: `The collection stopped${shown}. Check Collector settings, then start a new collection.` };
}

export const RESEARCH_STATUS: Readonly<Record<Research['status'], string>> = {
  queued: 'Waiting to start',
  dispatching: 'Starting the run on GitHub',
  collecting: 'Collecting on GitHub',
  collected: 'Collected',
  reviewing: 'Under review',
  packaging: 'Packaging the review',
  // Never "Ready" from the status alone: the panel shows readiness only from a live check (research-review-ui spec 1).
  approved: 'Approved review, not checked here',
  not_ready: 'Not ready: the Research Kit gate did not approve the review',
  failed: 'Failed',
  cancelling: 'Stopping',
  cancelled: 'Cancelled',
};
export const ACTIVE_RESEARCH: readonly Research['status'][] = ['queued', 'dispatching', 'collecting', 'reviewing', 'packaging', 'cancelling'];
export const CANCELLABLE_RESEARCH: readonly Research['status'][] = ['queued', 'dispatching', 'collecting', 'reviewing', 'packaging'];
/** Statuses the engine admits `research.review.start` from (review spec, "Start"). */
export const REVIEWABLE_RESEARCH: readonly Research['status'][] = ['collected', 'not_ready'];
/** Statuses main's `research.document.read` has a source for (research-review-ui spec 3). */
export const READABLE_RESEARCH: readonly Research['status'][] = ['collected', 'reviewing', 'packaging', 'approved', 'not_ready'];
export const cancelLabel = (status: Research['status']) => status === 'reviewing' || status === 'packaging' ? 'Cancel review' : 'Cancel collection';

// Bidirectional overrides and isolates can make untrusted text read differently from what it contains.
const BIDI = /[‪-‮⁦-⁩]/g;
/** Bounded plain text for display. React escapes it; this only removes direction controls and limits length. */
export function displayText(value: string, max: number): string {
  const text = value.replace(BIDI, '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
