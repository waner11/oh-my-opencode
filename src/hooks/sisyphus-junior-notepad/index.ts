import type { PluginInput } from "@opencode-ai/plugin"
import { isCallerOrchestrator } from "../../shared/session-utils"
import { SYSTEM_DIRECTIVE_PREFIX } from "../../shared/system-directive"
import { log } from "../../shared/logger"
import { HOOK_NAME, NOTEPAD_DIRECTIVE } from "./constants"
import { readBoulderState } from "../../features/boulder-state"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { NOTEPAD_BASE_PATH } from "../../features/boulder-state/constants"

export * from "./constants"

export function createSisyphusJuniorNotepadHook(ctx: PluginInput) {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown>; message?: string }
    ): Promise<void> => {
      // 1. Check if tool is delegate_task
      if (input.tool !== "delegate_task") {
        return
      }

      // 2. Check if caller is Atlas (orchestrator)
      if (!isCallerOrchestrator(input.sessionID)) {
        return
      }

      // 3. Get prompt from output.args
      const prompt = output.args.prompt as string | undefined
      if (!prompt) {
        return
      }

      // 4. Check for double injection
      if (prompt.includes(SYSTEM_DIRECTIVE_PREFIX)) {
        return
      }

      // 5. Create notepad files if boulder state exists
      let directiveToInject = NOTEPAD_DIRECTIVE
      try {
        const boulderState = readBoulderState(ctx.directory)
        if (boulderState) {
          const planName = boulderState.plan_name
          const notepadDir = join(ctx.directory, NOTEPAD_BASE_PATH, planName)
          
          // Create notepad directory
          mkdirSync(notepadDir, { recursive: true })
          
          // Create the 4 standard notepad files (no-op if they exist)
          const notepadFiles = ["learnings.md", "issues.md", "decisions.md", "problems.md"]
          for (const filename of notepadFiles) {
            const filePath = join(notepadDir, filename)
            writeFileSync(filePath, "", { flag: "a" })
          }
          
          // Replace {plan-name} placeholder with actual plan name
          directiveToInject = NOTEPAD_DIRECTIVE.replace(/{plan-name}/g, planName)
        }
      } catch (error) {
        // Graceful degradation - log but don't throw
        log(`[${HOOK_NAME}] Failed to create notepad files: ${error}`, {
          sessionID: input.sessionID,
        })
      }

      // 6. Prepend directive
      output.args.prompt = directiveToInject + prompt

      // 7. Log injection
      log(`[${HOOK_NAME}] Injected notepad directive to delegate_task`, {
        sessionID: input.sessionID,
      })
    },
  }
}
