import type { Research } from '../shared';

/**
 * What the research panel says about a job. Every job failure in the collection spec has its own entry; anything else
 * falls back to a generic message. Research text (topics, codes) is untrusted: it is shown only as bounded plain text.
 */
export const RESEARCH_FAILURES: Readonly<Record<string, { title: string; action: string }>> = {
  PROJECT_NOT_FOUND: { title: 'Project no longer available', action: 'This project is no longer registered. Open its folder again, then start a new collection.' },
  PROJECT_UNTRUSTED: { title: 'Project not trusted', action: 'The project was not trusted when the collection was due to proceed. Trust the project again, then start a new collection.' },
  RESEARCH_NOT_ALLOWED: { title: 'Research turned off', action: 'Research was turned off for this project, so the collection stopped. Allow research in the project policy, then start a new collection.' },
  POLICY_CHANGED: { title: 'Research setting changed', action: 'The project\'s research setting changed after this collection was requested, so Monnzila stopped it. Changing only the inference setting does not stop research. A run already started on GitHub is not cancelled there. Start a new collection under the current setting.' },
  TRUST_CHANGED: { title: 'Project trust changed', action: 'The project trust changed after this collection was requested, so Monnzila stopped it. A run already started on GitHub is not cancelled there. Start a new collection once the project is trusted.' },
  COLLECTOR_NOT_CONFIGURED: { title: 'Collector not set up', action: 'No collector repository was saved. Enter the repository, workflow and branch in Collector settings, then start again. Nothing was sent to GitHub.' },
  COLLECTOR_TOKEN_MISSING: { title: 'Collector token missing', action: 'No collector token was available. Save a token with Actions read and write permission on the collector repository in Collector settings, then start again.' },
  RESEARCH_KIT_UNAVAILABLE: { title: 'Research Kit unavailable', action: 'The Research Kit is not installed or failed its integrity check. Install or repair the Research Kit, restart Monnzila, then start again. Nothing was sent to GitHub.' },
  COLLECTOR_INPUT_TOO_LONG: { title: 'Inputs too long', action: 'The topic, queries and URLs do not fit in one collector command. Shorten or remove some of them, then start again. Nothing was sent to GitHub.' },
  COLLECTOR_CHANGED: { title: 'Collector settings changed', action: 'The collector settings changed before the collection could start. Check Collector settings, then start again. Nothing was sent to GitHub.' },
  DISPATCH_NOT_STARTED: { title: 'Collector did not start', action: 'The collector could not be started after three attempts. Nothing was sent to GitHub. Start again; if it keeps failing, restart Monnzila.' },
  COLLECTOR_REFUSED: { title: 'Request refused by the Research Kit', action: 'The Research Kit refused the collection request before contacting GitHub, for example because a setting is not valid for it. Check Collector settings, then start again.' },
  COLLECTOR_NOT_FOUND: { title: 'Collector not found', action: 'GitHub could not find the collector repository, workflow or branch, or the token cannot see them. Check Collector settings and the token\'s repository access, then start again.' },
  COLLECTOR_FORBIDDEN: { title: 'Collector access refused', action: 'GitHub refused to start the workflow. Give the token Actions read and write permission on the collector repository and check that Actions is enabled there, then start again.' },
  COLLECTOR_TOKEN_REJECTED: { title: 'Collector token rejected', action: 'GitHub rejected the collector token; it may be expired or revoked. Save a new token in Collector settings, then start again.' },
  COLLECTOR_REJECTED: { title: 'Request rejected by GitHub', action: 'GitHub rejected the collection request. Check that the workflow accepts these inputs and that the branch exists, then start again.' },
  REMOTE_STATE_UNKNOWN: { title: 'Run state unknown', action: 'Monnzila could not confirm whether a collection run started on GitHub. It did not try again, so no second run was started. Check the Actions page of the collector repository before starting a new collection: a run there may still be using your collection credits.' },
  RUN_FAILED: { title: 'Collection run failed', action: 'The collection run on GitHub did not succeed. Open it on the Actions page of the collector repository to see why, then start a new collection.' },
  ARTIFACT_MISSING: { title: 'Corpus not found', action: 'The run finished without a downloadable corpus. Check the run\'s artifacts on GitHub, then start a new collection.' },
  ARTIFACT_EXPIRED: { title: 'Corpus expired', action: 'The corpus expired on GitHub before it could be downloaded; GitHub keeps it for 7 days. Start a new collection.' },
  ARTIFACT_INVALID: { title: 'Corpus failed validation', action: 'The downloaded corpus failed the Research Kit\'s validation and was not used. Start a new collection; if this repeats, check the Research Kit version in the collector repository.' },
  ARTIFACT_INCOMPLETE: { title: 'Corpus incomplete', action: 'The Research Kit reported the downloaded corpus as incomplete or blocked, and it was not used. Start a new collection, for example with a larger page budget.' },
  COLLECTION_FAILED: { title: 'Nothing could be collected', action: 'The collector ran but reported that the collection failed. Check the search and scraping secrets and credits of the collector repository, then start again.' },
  RUN_IDENTITY_MISMATCH: { title: 'Run did not match the request', action: 'The GitHub run Monnzila found is not the one it started (a different run, repository, workflow, branch or trigger), so its corpus was not used. Check the Actions page of the collector repository, then start a new collection.' },
  PACKAGE_IDENTITY_MISMATCH: { title: 'Corpus from another run', action: 'The downloaded corpus belongs to a different run, attempt or commit than the one this collection started, so it was not used. Start a new collection.' },
  COLLECTION_EXPIRED: { title: 'Collection timed out', action: 'The collection did not finish within 7 days of starting, so Monnzila stopped following it. Start a new collection.' },
};

const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
/** An unlisted failure is still actionable; its code is shown only when it has the code shape. */
export function failureText(code: string): { title: string; action: string } {
  return RESEARCH_FAILURES[code] ?? { title: 'Collection failed', action: `The collection stopped${CODE.test(code) ? ` (${code})` : ''}. Check Collector settings, then start a new collection.` };
}

export const RESEARCH_STATUS: Readonly<Record<Research['status'], string>> = {
  queued: 'Waiting to start',
  dispatching: 'Starting the run on GitHub',
  collecting: 'Collecting on GitHub',
  collected: 'Collected',
  reviewing: 'Under review',
  approved: 'Ready: approved by the Research Kit gate',
  not_ready: 'Not ready: the Research Kit gate did not approve the review',
  failed: 'Failed',
  cancelling: 'Stopping',
  cancelled: 'Cancelled',
};
export const ACTIVE_RESEARCH: readonly Research['status'][] = ['queued', 'dispatching', 'collecting', 'reviewing', 'cancelling'];
export const CANCELLABLE_RESEARCH: readonly Research['status'][] = ['queued', 'dispatching', 'collecting', 'reviewing'];

// Bidirectional overrides and isolates can make untrusted text read differently from what it contains.
const BIDI = /[‪-‮⁦-⁩]/g;
/** Bounded plain text for display. React escapes it; this only removes direction controls and limits length. */
export function displayText(value: string, max: number): string {
  const text = value.replace(BIDI, '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
