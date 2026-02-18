# NASA Assessment Report

**Date:** 2026-02-18
**Scope:** Full system assessment — all new features (Chat, AI, History, Settings, Screenshot flow)
**Assessor:** Claude (NASA Skill v1.0)
**Overall Status:** WARNING

---

## Executive Summary

Komugi's core architecture is solid with proper type safety, immutable state patterns, and clean separation of concerns. However, there are **2 critical findings** (API key bundled in frontend, missing user input length validation), **4 warnings** (streaming cleanup, error message leakage, missing abort cleanup, hardcoded difficulty), and **5 caution items**. The critical findings must be addressed before any user-facing deployment.

---

## Counterfactual: Without This Assessment

- **Most dangerous undetected issue:** VITE_GEMINI_API_KEY is embedded in the production JavaScript bundle. Anyone who inspects the built app can extract the API key and run up charges on the key owner's account.
- **Estimated time to discovery:** 1-4 weeks (until someone inspects DevTools or the bundle)
- **Probable trigger:** A curious user or an automated scanner finding the key in the JS bundle
- **Impact on discovery:** Potentially thousands of dollars in API charges, key compromise requiring rotation
- **Cost to fix post-incident vs now:** 10x (key rotation, user notification, potential billing dispute)

---

## Dimension Scores

| Dimension        | Grade    | Findings | Critical | Actions Required                    |
| ---------------- | -------- | -------- | -------- | ----------------------------------- |
| 1. Risk          | WARNING  | 4        | 1        | Input validation, error propagation |
| 2. Business Risk | CRITICAL | 2        | 1        | API key exposure in bundle          |
| 3. IT Risk       | CAUTION  | 3        | 0        | CSP, localStorage, memory           |
| 4. Scalability   | CAUTION  | 2        | 0        | Screenshot memory, streaming buffer |
| 5. Architecture  | NOMINAL  | 3        | 0        | Minor Power of Ten violations       |

---

## Critical Findings (MUST Fix Before Deploy)

### CRIT-1: API Key Embedded in Production Bundle

- **Dimension:** Business Risk
- **Location:** `src/features/ai/api/gemini.ts:30`
- **Description:** `import.meta.env.VITE_GEMINI_API_KEY` is a Vite convention: any env var prefixed with `VITE_` is **embedded in the compiled JavaScript bundle**. This means the Gemini API key is visible in the shipped app binary. While CLAUDE.md states "alles laeuft lokal", anyone who extracts the app bundle can see the key in plaintext.
- **Failure Scenario:** User shares the app, a bad actor extracts the key from the JS bundle via DevTools or string search, and makes unlimited API calls billed to the key owner.
- **Blast Radius:** Financial exposure (Gemini API costs), key compromise, trust violation.
- **Fix:** Move the API call to Rust. Create a Tauri command `send_chat_message` that reads `GEMINI_API_KEY` from a local config file (not embedded in the bundle). The Rust binary is stripped and harder to extract. Alternatively, prompt the user to enter their own API key, stored encrypted via the OS keychain.
- **Verification:** After fix, search the compiled `dist/` folder for the API key string — it must not appear.

### CRIT-2: No User Input Length Validation on Chat Messages

- **Dimension:** Risk
- **Location:** `src/features/chat/components/ChatInput.tsx:28-33`, `src/features/ai/api/gemini.ts:87`
- **Description:** Chat messages are trimmed but have no maximum length. A user can paste megabytes of text which gets: (1) stored in Zustand state, (2) sent to the Gemini API as part of the request body, (3) combined with the base64 screenshot. There is no length check before the API call.
- **Failure Scenario:** User pastes 10MB of text → combined with a 5MB base64 screenshot → creates a 15MB+ API request → Gemini rejects it → no useful error shown, or Gemini charges for the tokens processed.
- **Blast Radius:** API errors, excessive costs, potential memory exhaustion in the WebView.
- **Fix:** Add `maxLength={4000}` to the textarea in `ChatInput.tsx`. Add a guard in `useSendMessage.ts` that checks `message.length <= 4000` before calling the API. Show a clear error if exceeded.
- **Verification:** Try pasting >4000 chars, verify rejection with user-facing error.

---

## Warning Findings (Fix Within Sprint)

### WARN-1: Streaming Content Not Cleared on Abort

- **Dimension:** Risk
- **Location:** `src/features/ai/hooks/useSendMessage.ts:62-67`
- **Description:** When the user aborts a streaming response, `setIsGenerating(false)` is called but `streamingContent` is NOT cleared. The partial streaming text remains visible in the UI via `StreamingMessage.tsx` (line 11: `if (!isGenerating && !streamingContent) return null`). This means after abort, a stale partial response stays on screen.
- **Risk:** User sees incomplete AI response, confusion about whether the response is final.
- **Fix:** In the abort handler (line 62-67), also call `set({ streamingContent: '' })` via a new action or directly reset. Similarly in the `abort` callback (line 76-81).
- **Priority:** High — affects core UX

### WARN-2: Gemini API Error Body Potentially Logged with Sensitive Info

- **Dimension:** Risk
- **Location:** `src/features/ai/api/gemini.ts:150-156`
- **Description:** On API error, the entire error body is logged AND thrown as part of the error message: `throw new Error(\`Gemini API error (${response.status}): ${errorBody}\`)`. This error propagates to `useSendMessage.ts:70`and then to`setLastError(errorMessage)`which renders in the UI at`ChatPanel.tsx:54-58`. The error body from Gemini could contain internal details or even partial API key info in some error responses.
- **Risk:** Sensitive information shown to user, error messages not user-friendly.
- **Fix:** Log the full error internally but show a sanitized, user-friendly message: `setLastError('Failed to get AI response. Please try again.')`. Map known status codes (429 = rate limit, 400 = bad request, 403 = invalid key) to specific messages.
- **Priority:** High — user-facing error quality

### WARN-3: Session Difficulty Not Synced from Settings Store

- **Dimension:** Architecture
- **Location:** `src/features/chat/stores/chatStore.ts:69`
- **Description:** `startSession` hardcodes `difficulty: 'intermediate'` instead of reading from `useSettingsStore`. The `settingsStore` has a `difficulty` field with persistence, but it's never read when creating a chat session. The difficulty picker in GeneralPane works but has no effect on actual AI behavior.
- **Risk:** User changes difficulty in Settings, but AI responses always use 'intermediate'.
- **Fix:** In `startSession`, read the current difficulty: `const { difficulty } = useSettingsStore.getState()` and use it. Import settingsStore in chatStore.
- **Priority:** High — core feature broken

### WARN-4: Top-level `await` in useSaveSessionToHistory

- **Dimension:** Architecture
- **Location:** `src/features/chat/hooks/useSaveSessionToHistory.ts:7-9`
- **Description:** Uses top-level `await import(...)` to work around React Compiler. While this works in modern bundlers with ESM, it means this module is async and its imports are deferred. If the module hasn't loaded by the time a session ends, the subscription won't be set up.
- **Risk:** Race condition on slow startup: session could end before the module initializes. Low probability but non-deterministic.
- **Fix:** Instead of dynamic import, use the pattern from `useScreenshotToChat.ts`: import the store normally and use `useEffect` initialization. The React Compiler issue can be solved by not calling `.getState()` in the useRef initializer.
- **Priority:** Medium — rare race condition

---

## Caution Findings (Track as Tech Debt)

### CAUT-1: Screenshot Base64 Held in Memory Twice

- **Dimension:** Scalability
- **Location:** `src/features/screenshot/stores/screenshotStore.ts`, `src/features/chat/stores/chatStore.ts:64`
- **Description:** When a screenshot is captured, the base64 string (1-5MB) is stored in `screenshotStore`. Then `useScreenshotToChat` copies it into `chatStore.currentSession.screenshotBase64`. Both stores hold the same data simultaneously. For a 5K display, this could be 8-10MB duplicated in memory.
- **Debt Category:** Performance
- **Resolve By:** Next sprint — clear screenshotStore after copying to chatStore.

### CAUT-2: No Clipboard API Error Handling

- **Dimension:** Reliability
- **Location:** `src/features/chat/components/ChatMessage.tsx:14-15`
- **Description:** `navigator.clipboard.writeText()` can throw (e.g., if page doesn't have focus, or clipboard permissions denied). The `handleCopy` function awaits it without try/catch. If it throws, the error is unhandled.
- **Debt Category:** Reliability
- **Resolve By:** Next sprint — wrap in try/catch, show toast on failure.

### CAUT-3: localStorage History Not Validated on Load

- **Dimension:** Reliability
- **Location:** `src/features/history/stores/historyStore.ts` (Zustand persist)
- **Description:** `persist` middleware reads from localStorage and trusts the data shape completely. If localStorage is corrupted or manually edited, the app could crash on load trying to render invalid session summaries. Zustand persist does not validate the stored shape.
- **Debt Category:** Reliability
- **Resolve By:** This quarter — add a `merge` function to the persist config that validates the shape.

### CAUT-4: Streaming SSE Parser Silently Swallows Non-JSON Errors

- **Dimension:** Reliability
- **Location:** `src/features/ai/api/gemini.ts:195-204`
- **Description:** The catch block only re-throws if the error is NOT a SyntaxError or JSON-related. This means if Gemini sends a valid JSON error message that doesn't match the chunk type, it could be silently swallowed. The distinction between "partial JSON line" and "API error in JSON format" is fragile.
- **Debt Category:** Reliability
- **Resolve By:** Next sprint — check for `chunk.error` BEFORE the try/catch, validate chunk shape explicitly.

### CAUT-5: addAssistantMessage Unused

- **Dimension:** Maintainability
- **Location:** `src/features/chat/stores/chatStore.ts:102-121`
- **Description:** `addAssistantMessage` is defined in the store but never called anywhere. All assistant messages come through `finalizeStreaming`. Dead code increases cognitive load.
- **Debt Category:** Maintainability
- **Resolve By:** Next sprint — remove or document why it exists for future non-streaming use.

---

## Power of Ten Violations

| Rule                         | File              | Line   | Violation                                                         | Severity |
| ---------------------------- | ----------------- | ------ | ----------------------------------------------------------------- | -------- |
| 7: All Return Values Checked | `ChatMessage.tsx` | 15     | `clipboard.writeText()` not try/caught                            | CAUTION  |
| 4: Functions ≤60 lines       | `gemini.ts:87`    | 87-212 | `streamGeminiResponse` is 125 lines                               | CAUTION  |
| 5: Assertions for Invariants | `chatStore.ts:69` | 69     | Hardcoded difficulty without assertion that settings store exists | WARNING  |
| 2: Loop Bounds               | `gemini.ts:168`   | 168    | `while(true)` SSE loop has no max iterations guard                | CAUTION  |
| 8: No Barrel Files           | All `index.ts`    | —      | Barrel files exist but are small and explicit (acceptable)        | NOMINAL  |

---

## Decisions Log

| #   | Decision                                      | Rationale                                    | Alternatives Considered                 |
| --- | --------------------------------------------- | -------------------------------------------- | --------------------------------------- |
| 1   | Rated API key as CRITICAL not ABORT           | App is local-only, key is user's own         | ABORT would halt all development        |
| 2   | Rated streaming abort as WARNING not CRITICAL | Stale text is cosmetic, not data loss        | CRITICAL if it blocked further messages |
| 3   | Rated localStorage trust as CAUTION           | Corruption is rare, impact is app crash only | WARNING if user data could be lost      |
| 4   | Rated difficulty sync as WARNING              | Feature explicitly promised but broken       | CRITICAL if it affected billing         |

---

## Recommendations

### Immediate (Before Next Deploy)

1. **CRIT-1:** Move Gemini API call to Rust backend or use user-provided key stored via OS keychain
2. **CRIT-2:** Add `maxLength={4000}` to ChatInput textarea and validate in useSendMessage
3. **WARN-3:** Read difficulty from settingsStore in chatStore.startSession

### Short-term (This Sprint)

1. **WARN-1:** Clear streamingContent on abort
2. **WARN-2:** Sanitize Gemini API error messages before showing in UI
3. **WARN-4:** Replace dynamic import with static import in useSaveSessionToHistory
4. **CAUT-2:** Add try/catch to clipboard.writeText

### Medium-term (This Quarter)

1. **CAUT-1:** Clear screenshotStore after copying to chat session
2. **CAUT-3:** Add Zustand persist validation/migration for localStorage data
3. **CAUT-4:** Improve SSE parser robustness
4. Split `streamGeminiResponse` into smaller functions (≤60 lines each)

### Architecture Improvements (Backlog)

1. Move all AI calls to Rust for key protection and better error handling
2. Add SQLite backend for history (replace localStorage persistence)
3. Add end-to-end test for Screenshot → Chat → AI flow
4. Add rate limiting (max N requests per minute) as cost protection

---

## Appendix: Files Assessed

| File                                                            | Lines | Findings | Highest Severity |
| --------------------------------------------------------------- | ----- | -------- | ---------------- |
| `src/features/ai/api/gemini.ts`                                 | 212   | 4        | CRITICAL         |
| `src/features/ai/hooks/useSendMessage.ts`                       | 85    | 2        | WARNING          |
| `src/features/ai/config/prompts.ts`                             | 39    | 0        | NOMINAL          |
| `src/features/chat/stores/chatStore.ts`                         | 179   | 3        | WARNING          |
| `src/features/chat/components/ChatPanel.tsx`                    | 105   | 0        | NOMINAL          |
| `src/features/chat/components/ChatMessage.tsx`                  | 53    | 1        | CAUTION          |
| `src/features/chat/components/ChatInput.tsx`                    | 76    | 1        | CRITICAL         |
| `src/features/chat/components/StreamingMessage.tsx`             | 35    | 0        | NOMINAL          |
| `src/features/chat/components/ScreenshotPreview.tsx`            | 37    | 0        | NOMINAL          |
| `src/features/chat/hooks/useScreenshotToChat.ts`                | 41    | 0        | NOMINAL          |
| `src/features/chat/hooks/useSaveSessionToHistory.ts`            | 43    | 1        | WARNING          |
| `src/features/history/stores/historyStore.ts`                   | 64    | 1        | CAUTION          |
| `src/features/history/components/HistorySidebar.tsx`            | 75    | 0        | NOMINAL          |
| `src/features/settings/stores/settingsStore.ts`                 | 36    | 0        | NOMINAL          |
| `src/features/screenshot/stores/screenshotStore.ts`             | 58    | 1        | CAUTION          |
| `src/features/screenshot/hooks/useScreenshotCommands.ts`        | 72    | 0        | NOMINAL          |
| `src/features/screenshot/hooks/useScreenshotListener.ts`        | 56    | 0        | NOMINAL          |
| `src/features/screenshot/components/ScreenshotSelectionApp.tsx` | 127   | 0        | NOMINAL          |
| `src-tauri/src/commands/screenshot.rs`                          | 523   | 0        | NOMINAL          |
| `src-tauri/src/types.rs`                                        | 137   | 0        | NOMINAL          |
| `src/components/preferences/panes/GeneralPane.tsx`              | 146   | 0        | NOMINAL          |
| `src/components/preferences/panes/AdvancedPane.tsx`             | 37    | 0        | NOMINAL          |
| `src/lib/bindings.ts`                                           | 257   | 0        | NOMINAL          |
| `src/services/preferences.ts`                                   | 64    | 0        | NOMINAL          |
| `src/hooks/useMainWindowEventListeners.ts`                      | 56    | 0        | NOMINAL          |
| `src-tauri/tauri.conf.json`                                     | 72    | 0        | NOMINAL          |

**Total: 26 files, ~2,870 lines, 13 findings (2 Critical, 4 Warning, 5 Caution, 2 Nominal notes)**

---

_Report generated by NASA Assessment Skill v1.0_
_"Failure is not an option." — Gene Kranz, NASA Flight Director_
