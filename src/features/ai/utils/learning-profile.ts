import type { LearningProfileEntry } from '@/lib/tauri-bindings'

const DEFAULT_MAX_ENTRIES = 10

/**
 * Formats learning profile entries for injection into the system prompt.
 * Returns empty string if no entries.
 */
export function formatProfileForPrompt(
  entries: readonly LearningProfileEntry[],
  maxEntries = DEFAULT_MAX_ENTRIES
): string {
  if (entries.length === 0) return ''

  const recent = entries.slice(-maxEntries)
  const lines = recent.map(entry => {
    const date = entry.date.slice(0, 10)
    const topics =
      entry.topics.length > 0 ? ` Topics: ${entry.topics.join(', ')}` : ''
    return `- [${date}] (${entry.difficulty}) ${entry.summary}${topics}`
  })

  return `LEARNER CONTEXT (from previous sessions):
${lines.join('\n')}

Use this to adapt explanations: skip what's mastered, give extra care to struggles.
Do NOT reference this context explicitly — just use it to calibrate.`
}
