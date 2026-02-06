import { describe, test, expect } from "bun:test"
import { buildHephaestusPrompt } from "./hephaestus"

describe("Hephaestus Edit Protocol", () => {
  test("should NOT contain 'Always read the file first' as standalone rule", () => {
    // given
    const prompt = buildHephaestusPrompt()

    // when / #then
    // The old Edit Protocol rule "Always read the file first" should be removed
    expect(prompt).not.toContain("Always read the file first")
  })

  test("should contain explicit handling for file-not-found scenarios", () => {
    // given
    const prompt = buildHephaestusPrompt()

    // when / #then
    // Should mention what to do when a file doesn't exist
    expect(prompt.toLowerCase()).toMatch(
      /does not exist|file.*not.*exist|read.*fail|file.*missing/i,
    )
  })

  test("should contain anti-loop instruction to prevent infinite retries", () => {
    // given
    const prompt = buildHephaestusPrompt()

    // when / #then
    // Should explicitly warn against retrying failed reads
    expect(prompt.toLowerCase()).toMatch(
      /never retry|do not retry|stop retrying|retry.*once|failed.*read/i,
    )
  })

  test("should preserve apply_patch instruction from old Edit Protocol", () => {
    // given
    const prompt = buildHephaestusPrompt()

    // when / #then
    // Item 3 from old protocol: Use `apply_patch` for edits
    expect(prompt).toContain("apply_patch")
  })

  test("should preserve sufficient context instruction from old Edit Protocol", () => {
    // given
    const prompt = buildHephaestusPrompt()

    // when / #then
    // Item 2 from old protocol: Include sufficient context for unique matching
    expect(prompt.toLowerCase()).toMatch(/sufficient context|context.*match|unique.*match/)
  })

  test("should preserve multiple context blocks instruction from old Edit Protocol", () => {
    // given
    const prompt = buildHephaestusPrompt()

    // when / #then
    // Item 4 from old protocol: Use multiple context blocks when needed
    expect(prompt.toLowerCase()).toMatch(/multiple.*context|context.*block/)
  })
})
