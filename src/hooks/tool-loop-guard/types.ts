export interface FailedCallRecord {
  tool: string
  key: string  // ${tool}:${filePath || args_hash}
  count: number
  lastSeen: number
}
