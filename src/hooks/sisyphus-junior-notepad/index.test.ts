import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test"
import { SYSTEM_DIRECTIVE_PREFIX } from "../../shared/system-directive"
import { NOTEPAD_DIRECTIVE } from "./constants"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { BoulderState } from "../../features/boulder-state/types"

// Mock the session-utils module
let mockIsCallerOrchestrator = false

mock.module("../../shared/session-utils", () => ({
  isCallerOrchestrator: (sessionID?: string) => mockIsCallerOrchestrator,
}))

// Mock boulder-state module
let mockBoulderState: BoulderState | null = null

mock.module("../../features/boulder-state", () => ({
  readBoulderState: (directory: string) => mockBoulderState,
}))

const { createSisyphusJuniorNotepadHook } = await import("./index")

describe("sisyphus-junior-notepad hook", () => {
  let hook: ReturnType<typeof createSisyphusJuniorNotepadHook>

  function createMockPluginInput() {
    return {
      client: {},
      directory: "/tmp/test",
    } as never
  }

  beforeEach(() => {
    mockIsCallerOrchestrator = false
    mockBoulderState = null
    hook = createSisyphusJuniorNotepadHook(createMockPluginInput())
  })

  afterEach(() => {
    const testDir = "/tmp/test/.sisyphus"
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe("tool filtering", () => {
    test("should only fire when tool is delegate_task", async () => {
      //#given
      const input = {
        tool: "Read",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then - prompt should not be modified
      expect(output.args.prompt).toBe("Some prompt")
    })

    test("should not fire for other tools like Write", async () => {
      //#given
      const input = {
        tool: "Write",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then - prompt should not be modified
      expect(output.args.prompt).toBe("Some prompt")
    })

    test("should not fire for Edit tool", async () => {
      //#given
      const input = {
        tool: "Edit",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then - prompt should not be modified
      expect(output.args.prompt).toBe("Some prompt")
    })
  })

  describe("caller filtering", () => {
    test("should only fire when caller is orchestrator", async () => {
      //#given
      mockIsCallerOrchestrator = false
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then - prompt should not be modified
      expect(output.args.prompt).toBe("Some prompt")
    })

    test("should fire when caller is orchestrator", async () => {
      //#given
      mockIsCallerOrchestrator = true
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then - prompt should be modified
      expect(output.args.prompt).toContain(NOTEPAD_DIRECTIVE)
    })
  })

  describe("directive injection", () => {
    beforeEach(() => {
      mockIsCallerOrchestrator = true
    })

    test("should prepend directive to prompt", async () => {
      //#given
      const originalPrompt = "Implement the feature"
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: originalPrompt },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then
      expect(output.args.prompt).toContain(NOTEPAD_DIRECTIVE)
      expect(output.args.prompt).toContain(originalPrompt)
      expect(output.args.prompt).toMatch(
        new RegExp(`^${NOTEPAD_DIRECTIVE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
      )
    })

    test("should include 'may not exist yet' language in directive", async () => {
      //#given
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then
      expect(NOTEPAD_DIRECTIVE).toContain("may not exist yet")
    })

    test("should include anti-loop instruction in directive", async () => {
      //#given
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then
      expect(NOTEPAD_DIRECTIVE).toContain("Do NOT retry reads in a loop")
    })

    test("should include all 4 filename conventions in directive", async () => {
      //#given
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then
      expect(NOTEPAD_DIRECTIVE).toContain("learnings.md")
      expect(NOTEPAD_DIRECTIVE).toContain("issues.md")
      expect(NOTEPAD_DIRECTIVE).toContain("decisions.md")
      expect(NOTEPAD_DIRECTIVE).toContain("problems.md")
    })

    test("should include APPEND only instruction in directive", async () => {
      //#given
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then
      expect(NOTEPAD_DIRECTIVE).toContain("APPEND")
      expect(NOTEPAD_DIRECTIVE).toContain("never overwrite")
    })

    test("should include Plan is READ ONLY instruction in directive", async () => {
      //#given
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then
      expect(NOTEPAD_DIRECTIVE).toContain("READ ONLY")
      expect(NOTEPAD_DIRECTIVE).toContain("SACRED")
      expect(NOTEPAD_DIRECTIVE).toContain("NEVER MODIFY THE PLAN FILE")
    })
  })

  describe("double-injection guard", () => {
    beforeEach(() => {
      mockIsCallerOrchestrator = true
    })

    test("should not double-inject if SYSTEM_DIRECTIVE_PREFIX already present", async () => {
      //#given
      const promptWithDirective = `${SYSTEM_DIRECTIVE_PREFIX} - some directive] Original prompt`
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: promptWithDirective },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then - prompt should not be modified
      expect(output.args.prompt).toBe(promptWithDirective)
    })

    test("should inject if SYSTEM_DIRECTIVE_PREFIX not present", async () => {
      //#given
      const originalPrompt = "Original prompt without directive"
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: originalPrompt },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then - prompt should be modified
      expect(output.args.prompt).not.toBe(originalPrompt)
      expect(output.args.prompt).toContain(NOTEPAD_DIRECTIVE)
    })
  })

  describe("edge cases", () => {
    beforeEach(() => {
      mockIsCallerOrchestrator = true
    })

    test("should handle missing prompt gracefully", async () => {
      //#given
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: {} as Record<string, unknown>,
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then - should not throw, args.prompt should remain undefined
      expect(output.args.prompt).toBeUndefined()
    })

    test("should handle undefined prompt gracefully", async () => {
      //#given
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: undefined },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then - should not throw, prompt should remain undefined
      expect(output.args.prompt).toBeUndefined()
    })

    test("should not inject for empty prompt string", async () => {
      //#given
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then - empty prompt is falsy, so hook returns early
      expect(output.args.prompt).toBe("")
    })
  })

  describe("notepad file creation", () => {
    beforeEach(() => {
      mockIsCallerOrchestrator = true
    })

    test("should create notepad directory and files when boulder state exists", async () => {
      //#given
      mockBoulderState = {
        active_plan: "/tmp/test/.sisyphus/plans/test-plan.md",
        started_at: "2026-02-05T00:00:00Z",
        session_ids: ["test-session"],
        plan_name: "test-plan",
      }
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then
      const notepadDir = "/tmp/test/.sisyphus/notepads/test-plan"
      expect(existsSync(notepadDir)).toBe(true)
      expect(existsSync(join(notepadDir, "learnings.md"))).toBe(true)
      expect(existsSync(join(notepadDir, "issues.md"))).toBe(true)
      expect(existsSync(join(notepadDir, "decisions.md"))).toBe(true)
      expect(existsSync(join(notepadDir, "problems.md"))).toBe(true)
    })

    test("should replace {plan-name} placeholder when boulder state exists", async () => {
      //#given
      mockBoulderState = {
        active_plan: "/tmp/test/.sisyphus/plans/my-feature.md",
        started_at: "2026-02-05T00:00:00Z",
        session_ids: ["test-session"],
        plan_name: "my-feature",
      }
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then
      expect(output.args.prompt).toContain(".sisyphus/notepads/my-feature/")
      expect(output.args.prompt).not.toContain("{plan-name}")
    })

    test("should use original directive when boulder state is null", async () => {
      //#given
      mockBoulderState = null
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then
      expect(output.args.prompt).toContain("{plan-name}")
      expect(output.args.prompt).toContain(NOTEPAD_DIRECTIVE)
    })

    test("should not overwrite existing files", async () => {
      //#given
      mockBoulderState = {
        active_plan: "/tmp/test/.sisyphus/plans/test-plan.md",
        started_at: "2026-02-05T00:00:00Z",
        session_ids: ["test-session"],
        plan_name: "test-plan",
      }
      const notepadDir = "/tmp/test/.sisyphus/notepads/test-plan"
      mkdirSync(notepadDir, { recursive: true })
      const existingContent = "# Existing content\n"
      writeFileSync(join(notepadDir, "learnings.md"), existingContent)

      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await hook["tool.execute.before"](input, output)

      //#then
      const { readFileSync } = require("node:fs")
      const content = readFileSync(join(notepadDir, "learnings.md"), "utf-8")
      expect(content).toBe(existingContent)
    })

    test("should gracefully handle file creation failures", async () => {
      //#given
      const mockPluginInput = {
        client: {},
        directory: "/invalid/path",
      } as never
      const failingHook = createSisyphusJuniorNotepadHook(mockPluginInput)
      
      mockBoulderState = {
        active_plan: "/invalid/path/.sisyphus/plans/test-plan.md",
        started_at: "2026-02-05T00:00:00Z",
        session_ids: ["test-session"],
        plan_name: "test-plan",
      }
      const input = {
        tool: "delegate_task",
        sessionID: "test-session",
        callID: "call-1",
      }
      const output = {
        args: { prompt: "Some prompt" },
      }

      //#when
      await failingHook["tool.execute.before"](input, output)

      //#then
      expect(output.args.prompt).toContain("Some prompt")
      expect(output.args.prompt).toContain("{plan-name}")
    })
  })
})
