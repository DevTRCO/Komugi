const BUG_EXTRACT_PROMPT = `Look at this screenshot and extract every bug, error, and issue you can find.

Scan systematically:
- **Console output**: Error messages, warnings, stack traces, failed assertions
- **Network/API**: Failed requests (red entries), hanging requests, CORS errors, wrong status codes
- **Visual defects**: Broken layouts, overflow/clipping, z-index issues, missing images or icons, wrong colors, misaligned elements
- **Data issues**: Incorrect values, stale data, empty states that should show data, counts that don't match, wrong user/account info
- **URL/Routing**: Malformed URLs, wrong query params, incorrect routes, 404 indicators
- **Error states**: Error modals, toast notifications, error boundaries, warning banners
- **Stuck states**: Loading spinners that never resolve, disabled buttons that should be active, forms that won't submit

For each issue found:
1. **What** — One-line description
2. **Where** — Exact location in the screenshot
3. **Severity** — Critical / Warning / Minor
4. **Likely cause** — Most probable root cause
5. **Suggested fix** — Concrete next step

If nothing is wrong, say so clearly. Do not invent problems.`

const EXPLAIN_PROMPT = `Look at this screenshot and explain what I'm seeing.

First, identify what this is (code editor, terminal, browser devtools, dashboard, error message, config file, documentation, etc.).

Then identify the most complex or potentially confusing part — the thing someone would most likely struggle with — and explain it from fundamentals up:
- What is the core concept or mechanism at play?
- Why does it work this way?
- What would happen if you changed or removed key parts?
- What's the mental model to reason about this on your own?

If there are error messages or unexpected output visible, explain what went wrong and why.
If it's code, explain the logic, patterns, and design decisions — not just what each line does.
If it's a UI, explain the user flow and what the interface is trying to accomplish.

Assume I have zero context. Don't skip the basics.`

const UIUX_PROMPT = `Perform a detailed UI/UX design assessment of this screenshot. Be specific with values — approximate px values, hex colors, font sizes.

**PART 1 — Design Audit:**

Analyze each dimension:
- **Layout & Grid**: Column structure, container max-width, content alignment, gutters, how sections relate spatially
- **Spacing**: Padding inside containers/cards/buttons (approximate px), margins between sections, vertical rhythm pattern (is it 4px/8px/16px based?)
- **Typography**: Heading sizes and weights, body text size, line-heights, font family (serif/sans/mono), text color values
- **Colors**: Primary, secondary, accent colors (hex approximations), background layers, how many distinct grays are used, WCAG contrast observations
- **Borders & Shadows**: Border radii (rounded-sm/md/lg/full?), border colors and widths, shadow depth and spread, divider patterns
- **Components**: Button styles, input field patterns, card structures, navigation pattern, icon style and sizing
- **Hierarchy & Flow**: Visual weight distribution, what draws the eye first, reading flow, whitespace usage

**PART 2 — Recommendations:**
List 3-5 specific improvements with reasoning.

**PART 3 — Recreation Prompt:**
Write a detailed prompt (for an AI coding assistant) that would recreate this exact UI. Include all specifics: technology, framework, exact spacing values, colors, typography, layout approach, component structure. Output the prompt in a fenced code block.`

export interface PresetConfig {
  readonly i18nKey: string
  readonly icon: 'Bug' | 'GraduationCap' | 'Palette'
  readonly userMessage: string
}

export const PRESET_CONFIGS: readonly PresetConfig[] = [
  {
    i18nKey: 'presets.bugExtract',
    icon: 'Bug',
    userMessage: BUG_EXTRACT_PROMPT,
  },
  {
    i18nKey: 'presets.explain',
    icon: 'GraduationCap',
    userMessage: EXPLAIN_PROMPT,
  },
  {
    i18nKey: 'presets.uiuxAssessment',
    icon: 'Palette',
    userMessage: UIUX_PROMPT,
  },
]
