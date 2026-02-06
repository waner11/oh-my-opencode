import { describe, it, expect, beforeEach } from "bun:test"
import { createToolLoopGuardHook } from "./index"
import { DEFAULT_THRESHOLD, FAILURE_PATTERNS } from "./constants"

describe("createToolLoopGuardHook", () => {
  let hook: ReturnType<typeof createToolLoopGuardHook>

  beforeEach(() => {
    hook = createToolLoopGuardHook({} as any)
  })

  describe("tool.execute.after", () => {
    const createInput = (tool: string, args?: unknown) => ({
      tool,
      sessionID: "test-session",
      callID: "test-call-id",
      args,
    })

    const createOutput = (outputText: string) => ({
      title: "Read",
      output: outputText,
      metadata: {},
    })

    describe("#given successful Read tool calls", () => {
      describe("#when Read returns valid content", () => {
        it("#then should not inject warning", async () => {
          const input = createInput("Read", { filePath: "/test/file.ts" })
          const output = createOutput("const x = 1")

          await hook["tool.execute.after"](input, output)

          expect(output.output).toBe("const x = 1")
          expect(output.output).not.toContain("[SYSTEM DIRECTIVE]")
        })
      })
    })

    describe("#given failed Read below threshold", () => {
      describe("#when same file fails twice", () => {
        it("#then should not inject warning yet", async () => {
          const input = createInput("Read", { filePath: "/test/missing.ts" })
          const output1 = createOutput("Error: ENOENT: file not found")
          const output2 = createOutput("Error: ENOENT: file not found")

          await hook["tool.execute.after"](input, output1)
          await hook["tool.execute.after"](input, output2)

          expect(output1.output).not.toContain("[SYSTEM DIRECTIVE]")
          expect(output2.output).not.toContain("[SYSTEM DIRECTIVE]")
        })
      })
    })

    describe("#given failed Read at threshold", () => {
      describe("#when same file fails 3 times", () => {
        it("#then should inject warning on third failure", async () => {
          const input = createInput("Read", { filePath: "/test/missing.ts" })
          
          for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
            const output = createOutput("Error: ENOENT: file not found")
            await hook["tool.execute.after"](input, output)

            if (i < DEFAULT_THRESHOLD - 1) {
              expect(output.output).not.toContain("[SYSTEM DIRECTIVE]")
            } else {
              expect(output.output).toContain("[SYSTEM DIRECTIVE]")
              expect(output.output).toContain("/test/missing.ts")
              expect(output.output).toContain("3 times")
              expect(output.output).toContain("Create the file using Write tool")
              expect(output.output).toContain("Use glob() to discover what files actually exist")
            }
          }
        })
      })
    })

    describe("#given warning message content", () => {
      describe("#when threshold reached", () => {
        it("#then should include file path and alternatives", async () => {
          const input = createInput("Read", { filePath: "/src/components/Button.tsx" })
          
          for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
            const output = createOutput("File not found")
            await hook["tool.execute.after"](input, output)
          }

          const finalOutput = createOutput("File not found")
          await hook["tool.execute.after"](input, finalOutput)

          expect(finalOutput.output).toContain("/src/components/Button.tsx")
          expect(finalOutput.output).toContain("Create the file using Write tool")
          expect(finalOutput.output).toContain("Skip this file and proceed")
          expect(finalOutput.output).toContain("Use glob()")
          expect(finalOutput.output).toContain("Do NOT attempt to read this file again")
        })
      })
    })

    describe("#given different sessions", () => {
      describe("#when different sessions fail on same file", () => {
        it("#then should track per-session state independently", async () => {
          const input1 = createInput("Read", { filePath: "/test/file.ts" })
          input1.sessionID = "session-1"
          
          const input2 = createInput("Read", { filePath: "/test/file.ts" })
          input2.sessionID = "session-2"

          for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
            const output1 = createOutput("ENOENT")
            const output2 = createOutput("ENOENT")
            
            await hook["tool.execute.after"](input1, output1)
            await hook["tool.execute.after"](input2, output2)
          }

          const output1 = createOutput("ENOENT")
          const output2 = createOutput("ENOENT")
          
          await hook["tool.execute.after"](input1, output1)
          await hook["tool.execute.after"](input2, output2)

          expect(output1.output).toContain("[SYSTEM DIRECTIVE]")
          expect(output2.output).toContain("[SYSTEM DIRECTIVE]")
        })
      })
    })

    describe("#given session.deleted event", () => {
      describe("#when session is deleted", () => {
        it("#then should clean up session state", async () => {
          const input = createInput("Read", { filePath: "/test/file.ts" })
          const output = createOutput("ENOENT")

          await hook["tool.execute.after"](input, output)
          await hook.event({ 
            event: { 
              type: "session.deleted", 
              properties: { info: { id: "test-session" } } 
            } 
          })

          for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
            const newOutput = createOutput("ENOENT")
            await hook["tool.execute.after"](input, newOutput)
          }

          const finalOutput = createOutput("ENOENT")
          await hook["tool.execute.after"](input, finalOutput)
          expect(finalOutput.output).toContain("[SYSTEM DIRECTIVE]")
        })
      })
    })

    describe("#given missing or undefined output", () => {
      describe("#when output is not a string", () => {
        it("#then should handle gracefully without errors", async () => {
          const input = createInput("Read", { filePath: "/test/file.ts" })
          const output = { title: "Read", output: null as any, metadata: {} }

          await expect(async () => {
            await hook["tool.execute.after"](input, output)
          }).not.toThrow()
        })
      })
    })

    describe("#given empty Read output", () => {
      describe("#when Read returns empty string", () => {
        it("#then should treat as failure", async () => {
          const input = createInput("Read", { filePath: "/test/empty.ts" })
          
          for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
            const output = createOutput("")
            await hook["tool.execute.after"](input, output)
          }

          const finalOutput = createOutput("")
          await hook["tool.execute.after"](input, finalOutput)
          
          expect(finalOutput.output).toContain("[SYSTEM DIRECTIVE]")
        })
      })
    })

    describe("#given various failure patterns", () => {
      FAILURE_PATTERNS.forEach((pattern) => {
        describe(`#when output contains "${pattern}"`, () => {
          it("#then should detect as failure", async () => {
            const input = createInput("Read", { filePath: "/test/file.ts" })
            
            for (let i = 0; i < DEFAULT_THRESHOLD; i++) {
              const output = createOutput(`Error: ${pattern}`)
              await hook["tool.execute.after"](input, output)
            }

            const finalOutput = createOutput(`Error: ${pattern}`)
            await hook["tool.execute.after"](input, finalOutput)
            
            expect(finalOutput.output).toContain("[SYSTEM DIRECTIVE]")
          })
        })
      })
    })
  })
})
