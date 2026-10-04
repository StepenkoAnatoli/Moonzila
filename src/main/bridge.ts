import { parseRequest, parseResult, type Request } from '../shared';

export interface FrameIdentity { webContentsId: number; frameId: number; url: string }
export interface SenderIdentity extends FrameIdentity { isMainFrame: boolean }
export function isTrustedSender(sender: SenderIdentity, expected: FrameIdentity): boolean {
  return sender.isMainFrame && sender.webContentsId === expected.webContentsId
    && sender.frameId === expected.frameId && sender.url === expected.url;
}

/** Only explicitly mapped errors are allowed across IPC. Raw exceptions may contain credentials or paths. */
const publicMessages: Record<string, string> = {
  PROJECT_REQUIRED: 'Attach a workspace before using Build, files or commands.',
  PROJECT_TICKET_INVALID: 'The folder selection expired. Choose the folder again.',
  PROJECT_VOLUME_UNSUPPORTED: 'Choose a folder on a local fixed drive.',
  PROJECT_UNTRUSTED: 'Trust this project before running a task.',
  PROJECT_NOT_FOUND: 'This project is no longer available.',
  SESSION_NOT_FOUND: 'This conversation is no longer available.',
  PROFILE_NOT_FOUND: 'Choose an available model profile.',
  INVALID_ENDPOINT: 'Use an https:// endpoint, or http:// only on this computer (localhost, 127.0.0.1 or [::1]). Ollama profiles must use a local endpoint. Remove any user name, password, query or fragment from the address.',
  REVIEW_NOT_AVAILABLE: 'This research cannot be reviewed now. Only a collected corpus, or one that is not ready yet, can be reviewed.',
  REVIEW_WORKSPACE_TOO_LARGE: 'This corpus has too many files to review safely on this computer.',
  STALE_VERIFICATION: 'The collected corpus could not be verified again. Start a new collection.',
  RESEARCH_KIT_UNAVAILABLE: 'The Research Kit is not installed or failed its integrity check. Install or repair it, then restart Monnzila.',
  CLOUD_NOT_ALLOWED: 'This conversation or project allows local inference only. Choose a local profile or use Review cloud access to explicitly allow this project’s content to reach the selected provider.',
  CREDENTIAL_UNAVAILABLE: 'A saved key cannot be reused at a different endpoint or provider type. Enter the key for the new destination, or create a separate profile.',
  COLLECTOR_TOKEN_REQUIRED: 'Enter the collector token again when you change the collector repository, or remove the saved token.',
  RUN_CANCELLED: 'The run was stopped.',
  RUN_ACTIVE: 'Wait for the active run to finish, or stop it first.',
  RESEARCH_NOT_ALLOWED: 'Research is off for this project. Allow research in the project policy first.',
  REQUEST_CONFLICT: 'This request identity was already used with different content.',
  ENGINE_UNAVAILABLE: 'The engine is restarting. Try again when it is ready.',
  NOT_IMPLEMENTED: 'This capability is not available in this development build.',
  ENCRYPTION_UNAVAILABLE: 'Windows credential encryption is unavailable. The credential was not saved.',
  NOT_FOUND: 'This operation is no longer available.',
  APPROVAL_STALE: 'This approval is no longer valid. Review the current task again.',
  FILE_CONFLICT: 'The file changed since this edit was recorded. Your current file was preserved.',
  HARDLINK_REVIEW_REQUIRED: 'This file now has more than one hard link, so it cannot be changed or inspected safely. No project files were changed.',
  UNDO_UNAVAILABLE: 'Undo is unavailable for this change or its original snapshot.',
  RECOVERY_REQUIRED: 'Review interrupted operations in Recovery before starting another Build task.',
  SNAPSHOT_QUOTA: 'The snapshot budget is full of protected edits. Finish the run or review interrupted operations before proposing more edits.',
  SNAPSHOT_CORRUPT: 'Snapshot storage contains damaged or unexpected files. No project files were changed by this request.',
  PATH_OUTSIDE_PROJECT: 'This path is outside the permitted project files.',
};

export function safeError(error: unknown): { code: string; message: string; retry: 'never' | 'after-reconcile' } {
  const code = error instanceof Error && error.message in publicMessages ? error.message : 'INTERNAL_ERROR';
  return { code, message: publicMessages[code] ?? 'The operation could not be completed. No private error details were shared.',
    retry: code === 'ENGINE_UNAVAILABLE' ? 'after-reconcile' : 'never' };
}

export function createBridge(expected: () => FrameIdentity, handler: (request: Request) => Promise<unknown>) {
  return async (sender: SenderIdentity, input: unknown) => {
    if (!isTrustedSender(sender, expected())) throw new Error('UNTRUSTED_SENDER');
    let request: Request;
    try {
      if (JSON.stringify(input).length > 2_000_000) throw new Error('oversized');
      request = parseRequest(input);
    } catch { throw new Error('INVALID_REQUEST'); }
    const identity = { protocolVersion: 1 as const, clientRequestId: request.clientRequestId, method: request.method };
    try {
      const result = parseResult(request.method, await handler(request));
      return { ...identity, ok: true as const, result };
    } catch (error) {
      return { ...identity, ok: false as const, error: safeError(error) };
    }
  };
}
