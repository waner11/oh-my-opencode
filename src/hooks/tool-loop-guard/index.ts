import type { PluginInput } from "@opencode-ai/plugin"
import { FAILURE_PATTERNS, DEFAULT_THRESHOLD, ENTRY_TTL_MS, MAX_TRACKED_ENTRIES } from "./constants"
import type { FailedCallRecord } from "./types"
import { createHash } from "crypto"

function hashArgs(args: unknown): string {
  const str = JSON.stringify(args)
  return createHash("sha256").update(str).digest("hex").slice(0, 16)
}

function extractFilePath(args: unknown): string | null {
  if (typeof args === "object" && args !== null) {
    if ("filePath" in args && typeof args.filePath === "string") {
      return args.filePath
    }
    if ("file_path" in args && typeof (args as { file_path?: unknown }).file_path === "string") {
      return (args as { file_path: string }).file_path
    }
  }
  return null
}

function buildCallSignature(tool: string, args: unknown): string {
  const filePath = extractFilePath(args)
  if (filePath) {
    return `${tool}:${filePath}`
  }
  return `${tool}:${hashArgs(args)}`
}

function isFailure(tool: string, output: string): boolean {
  const toolLower = tool.toLowerCase()
  const outputLower = output.toLowerCase()

  if (toolLower === "read" && output.trim() === "") {
    return true
  }

  return FAILURE_PATTERNS.some((pattern) => outputLower.includes(pattern.toLowerCase()))
}

function cleanupExpiredEntries(sessionMap: Map<string, FailedCallRecord>): void {
  const now = Date.now()
  const toDelete: string[] = []

  for (const [key, record] of sessionMap.entries()) {
    if (now - record.lastSeen > ENTRY_TTL_MS) {
      toDelete.push(key)
    }
  }

  for (const key of toDelete) {
    sessionMap.delete(key)
  }

  if (sessionMap.size > MAX_TRACKED_ENTRIES) {
    const sorted = Array.from(sessionMap.entries()).sort((a, b) => a[1].lastSeen - b[1].lastSeen)
    const toRemove = sorted.slice(0, sessionMap.size - MAX_TRACKED_ENTRIES)
    for (const [key] of toRemove) {
      sessionMap.delete(key)
    }
  }
}

function buildWarningMessage(record: FailedCallRecord): string {
  const filePath = record.key.split(":")[1] || "this resource"
  
  return `
[SYSTEM DIRECTIVE] You have attempted to read "${filePath}" ${record.count} times and it does not exist.
STOP retrying. Either:
1. Create the file using Write tool with initial content
2. Skip this file and proceed with your task
3. Use glob() to discover what files actually exist in the directory
Do NOT attempt to read this file again.
`
}

export function createToolLoopGuardHook(_ctx: PluginInput) {
  const sessionState = new Map<string, Map<string, FailedCallRecord>>()

  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args?: unknown },
      output: { title: string; output: string; metadata: unknown }
    ) => {
      if (typeof output.output !== "string") return

      const failed = isFailure(input.tool, output.output)
      if (!failed) return

      let sessionMap = sessionState.get(input.sessionID)
      if (!sessionMap) {
        sessionMap = new Map()
        sessionState.set(input.sessionID, sessionMap)
      }

      cleanupExpiredEntries(sessionMap)

      const signature = buildCallSignature(input.tool, input.args)
      const existing = sessionMap.get(signature)

      if (existing) {
        existing.count += 1
        existing.lastSeen = Date.now()

        if (existing.count >= DEFAULT_THRESHOLD) {
          const warning = buildWarningMessage(existing)
          output.output += `\n${warning}`
        }
      } else {
        sessionMap.set(signature, {
          tool: input.tool,
          key: signature,
          count: 1,
          lastSeen: Date.now(),
        })
      }
    },

    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type === "session.deleted") {
        const props = event.properties as { info?: { id?: string } } | undefined
        if (props?.info?.id) {
          sessionState.delete(props.info.id)
        }
      }
    },
  }
}
