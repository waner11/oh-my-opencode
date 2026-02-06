export const HOOK_NAME = "tool-loop-guard"
export const DEFAULT_THRESHOLD = 3  // Trigger warning after 3 identical failed calls
export const MAX_TRACKED_ENTRIES = 50
export const ENTRY_TTL_MS = 5 * 60 * 1000  // 5 minutes

export const FAILURE_PATTERNS = [
  "ENOENT",
  "file not found",
  "File not found",
  "no such file",
  "does not exist",
]
