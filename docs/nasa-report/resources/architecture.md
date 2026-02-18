# Dimension 5: Architecture

## Purpose

Assess clean code quality, separation of concerns, dependency health, and production
readiness using NASA's rigorous engineering standards. Code that is hard to read is hard
to trust. Code that is hard to trust does not belong in production.

## NASA's Power of Ten Rules (Adapted for TypeScript)

### Rule 1: Simple Control Flow

- No goto equivalents (no labeled break/continue)
- No recursion without provable termination bound
- Maximum nesting depth: 2 levels
- Early returns over nested conditionals
- No complex ternary chains (max 1 ternary, no nesting)

### Rule 2: Fixed Upper Bounds on Loops

- Every while loop has a maximum iteration guard
- Every recursive function has a depth limit
- Every for loop has a clearly bounded range
- `.map()`, `.filter()`, `.reduce()` preferred over manual loops

### Rule 3: No Dynamic Memory After Initialization

- No runtime `new` in hot paths (pre-allocate where possible)
- No growing arrays without bounds in request handlers
- Stream processing for large datasets (not buffer-then-process)
- No memory leaks from closures capturing large objects
- Avoid creating objects in tight loops

### Rule 4: Functions Fit on One Screen (~60 lines max)

- No function exceeds 60 lines
- Each function does exactly one thing
- Function name describes what it does (no `handleStuff`, `processData`)
- Max 4 parameters (use options object beyond that)
- No function has more than 3 responsibilities

### Rule 5: Assertions for Invariants

- Critical assumptions have runtime assertions
- Type narrowing uses runtime checks, not type assertions
- "Impossible" states throw with descriptive messages
- Enum exhaustiveness is checked (never pattern)
- Null/undefined checks at trust boundaries

### Rule 6: Minimal Variable Scope

- Variables declared at point of first use
- No module-level mutable state
- No `let` where `const` suffices
- Destructuring over intermediate variables
- No variable reuse (each name used for one purpose)

### Rule 7: All Return Values Checked

- No ignored Promise (every async call awaited or explicitly handled)
- No ignored function return values (especially error indicators)
- `void` functions explicitly typed as void
- Error results checked before proceeding (Result pattern)
- No fire-and-forget side effects in request handlers

### Rule 8: Minimal Preprocessor Use

- No barrel files that obscure imports
- Import paths are explicit (no magic re-exports)
- No circular dependencies
- No dynamic imports in critical paths (lazy load only for perf)
- No `eval()`, `new Function()`, or string-based code execution

### Rule 9: Reference Safety

- No mutation of function parameters
- No shared mutable state between modules
- Immutable data structures only (`readonly`, `as const`, spread)
- No object references shared across async boundaries without cloning
- React state updates use immutable patterns

### Rule 10: Compile with All Warnings

- TypeScript strict mode: `strict: true` in tsconfig
- No `any` types (zero tolerance)
- No `@ts-ignore` or `@ts-expect-error` without linked issue
- No ESLint disable comments without justification
- No suppressed warnings in build output
- All type errors resolved (not worked around)

## Clean Code Assessment

### Separation of Concerns

- Rust commands are thin (validation + delegation)
- Business logic lives in dedicated modules (not in components)
- Database access is encapsulated in history commands
- UI components don't contain business logic
- Configuration is centralized (not hardcoded in multiple files)
- Error handling is consistent (shared patterns, not ad-hoc)

### Dependency Health

- No circular dependencies between modules
- Dependencies flow one direction: components → hooks → stores → services → Rust
- No business logic depends on UI framework (portable)
- External service calls (Gemini) are behind abstractions (swap-friendly)

### Naming Quality

- Types describe shape, not usage (`ChatMessage` not `MessageData`)
- Functions describe action (`captureScreenshot` not `doStuff`)
- Boolean variables/props use is/has/should prefix
- Constants use SCREAMING_SNAKE_CASE
- Files use kebab-case
- No abbreviations except universally understood (e.g., `id`, `url`)

### Production Readiness

- All environment variables validated at startup
- Graceful degradation for optional features
- Structured logging with appropriate levels
- Error monitoring configured
- Feature flags for gradual rollout (if applicable)

## Severity Classification

| Finding                                         | Grade    |
| ----------------------------------------------- | -------- |
| `any` type in AI processing                     | CRITICAL |
| 200-line function in screenshot flow            | WARNING  |
| Circular dependency between modules             | WARNING  |
| Business logic in React component               | CAUTION  |
| Missing exhaustive check on discriminated union | WARNING  |
| Mutable state shared across async boundary      | CRITICAL |
| No runtime validation at trust boundary         | WARNING  |
| Dead code in production bundle                  | CAUTION  |
