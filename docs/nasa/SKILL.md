---
name: nasa
description: NASA-grade code assessment across 5 dimensions (Risk, Business Risk, IT Risk, Scalability, Architecture). Deterministic bug finding where every error could cost millions. Generates documented reports under docs/nasa-report/ with decisions, findings, and counterfactual analysis.
---

# NASA: Mission-Critical Code Assessment

## Philosophy

> "There is no problem so bad you can't make it worse." — Chris Hadfield, NASA Astronaut

Every line of code in production is a potential point of failure. In NASA's world, a single uncaught edge case destroys a $700M Mars orbiter. In our world, a single uncaught bug can leak user data, corrupt financial transactions, or silently degrade the product until users leave.

**This skill treats our codebase with the same rigor NASA applies to flight software.**

The NASA approach is NOT about being slow or bureaucratic. It is about being **deterministic** — systematically eliminating uncertainty until every behavior is accounted for.

## When to Use

**Triggers:**
- Before deploying critical features (payments, auth, AI interactions, data pipelines)
- Before major refactors that touch multiple systems
- After incident response (post-mortem hardening)
- When shipping features that touch user data + money + AI in combination
- Pre-launch readiness check
- When gut feeling says "this feels risky but I can't articulate why"
- Periodic health check on critical subsystems

**Do NOT use for:**
- Simple UI tweaks with no data/auth implications
- Documentation-only changes
- Adding a dev dependency
- Renaming a CSS class

## The 5 Assessment Dimensions

Each dimension gets a severity grade: **NOMINAL** | **CAUTION** | **WARNING** | **CRITICAL** | **ABORT**

```
                    NASA CODE ASSESSMENT
    ┌─────────────────────────────────────────────┐
    │                                             │
    │   1. RISK ASSESSMENT                        │
    │      General failure modes, edge cases,     │
    │      error propagation, data integrity      │
    │                                             │
    │   2. BUSINESS RISK                          │
    │      Revenue impact, user trust, legal      │
    │      liability, competitive exposure        │
    │                                             │
    │   3. IT RISK                                │
    │      Database efficiency, query perf,       │
    │      IT security, infrastructure health     │
    │                                             │
    │   4. SCALABILITY                            │
    │      Load patterns, growth ceilings,        │
    │      resource exhaustion, bottlenecks       │
    │                                             │
    │   5. ARCHITECTURE                           │
    │      Clean code, separation of concerns,    │
    │      dependency health, production          │
    │      readiness, NASA clean code rules       │
    │                                             │
    └─────────────────────────────────────────────┘
```

## Execution Protocol

### Phase 0: Scope Definition
- Identify the target: specific files, feature area, or full system
- User provides scope via argument (file path, feature name, or "full" for system-wide)
- If no argument: assess the most recently changed files (git diff)

### Phase 1: Reconnaissance (Parallel Agents)
Deploy multiple research agents simultaneously to gather intelligence:

**Agent 1 — Code Cartographer:**
- Map all files in scope
- Trace data flow: input → processing → storage → output
- Identify trust boundaries (user input, API responses, DB queries, LLM outputs)
- Catalog all external dependencies and their versions

**Agent 2 — Database Inspector:**
- Analyze all queries touching the scope
- Check for N+1 patterns, missing indexes, unbounded queries
- Verify caching strategy (TTLs, invalidation)
- Inspect migration history for the affected tables
- Check connection pooling and query timeouts

**Agent 3 — Security Scanner:**
- Check auth/authz on every endpoint in scope
- Verify input validation at trust boundaries
- Check for injection vectors (SQL, XSS, prompt injection)
- Verify secrets management and environment variable handling
- Check rate limiting and abuse vectors

**Agent 4 — Type & Contract Analyzer:**
- Verify TypeScript strict mode compliance
- Check for `any` types, unsafe assertions, missing error handling
- Validate schema coverage at trust boundaries
- Check for mutation violations

### Phase 2: Assessment (Sequential, Per Dimension)

For each of the 5 dimensions, follow the detailed checklist in the corresponding resource file:

1. **Risk Assessment** → `resources/risk-assessment.md`
2. **Business Risk** → `resources/business-risk.md`
3. **IT Risk** → `resources/it-risk.md`
4. **Scalability** → `resources/scalability.md`
5. **Architecture** → `resources/architecture.md`

### Phase 3: Deterministic Bug Finding
NASA's Power of Ten rules applied to our codebase:

1. **No unbounded loops** — Every loop/recursion must have a provable upper bound
2. **No dynamic memory after init** — Avoid runtime allocations in hot paths
3. **No function > 60 lines** — If it's longer, it hides bugs
4. **All return values checked** — No fire-and-forget promises, no ignored errors
5. **Minimal scope for variables** — No variable declared wider than needed
6. **All data validated at entry** — Trust boundaries have schemas
7. **No dead code** — Dead code is untested code is buggy code
8. **No side effects in expressions** — Pure functions wherever possible
9. **Assertions for invariants** — If something "can't happen," assert it
10. **Compile with all warnings** — TypeScript strict mode, no suppressions

For each rule violation found, document:
- File and line number
- The violation
- Why it's dangerous (concrete failure scenario)
- The fix
- Blast radius if unfixed

### Phase 4: Counterfactual Analysis
**"What would happen if NASA wasn't called?"**

Document for EACH finding:
- The probability of the issue manifesting in production
- The impact when it manifests (data loss, revenue loss, security breach, UX degradation)
- The expected time-to-discovery without this assessment
- The cost of fixing it now vs. fixing it after it manifests

### Phase 5: Report Generation
Generate a structured report at `docs/nasa-report/NASA-REPORT-{date}-{scope}.md`

Report structure:
```markdown
# NASA Assessment Report
## Date: {date}
## Scope: {description}
## Overall Status: {NOMINAL|CAUTION|WARNING|CRITICAL|ABORT}

### Executive Summary
{2-3 sentences on overall health}

### Counterfactual: Without This Assessment
{What would have happened if this review wasn't performed}

### Dimension Scores
| Dimension | Grade | Findings | Critical |
|-----------|-------|----------|----------|
| Risk | ... | ... | ... |
| Business Risk | ... | ... | ... |
| IT Risk | ... | ... | ... |
| Scalability | ... | ... | ... |
| Architecture | ... | ... | ... |

### Critical Findings (Fix Before Deploy)
{Ordered by severity, with file:line references}

### Warning Findings (Fix Within Sprint)
{Ordered by severity}

### Caution Findings (Track as Tech Debt)
{Ordered by severity}

### Decisions Log
{Every judgment call made during assessment, with rationale}

### Recommendations
{Prioritized action items}
```

## Grading Scale

| Grade | Meaning | Action |
|-------|---------|--------|
| **NOMINAL** | No issues found. Systems operating within parameters. | Proceed with confidence. |
| **CAUTION** | Minor issues found. No immediate risk. | Track and schedule fixes. |
| **WARNING** | Significant issues found. Risk of degradation. | Fix before next deploy. |
| **CRITICAL** | Serious issues found. Active risk to users/data/revenue. | Stop and fix immediately. |
| **ABORT** | Showstopper. Deploying this code would cause harm. | Do not deploy under any circumstances. |

## Integration

**Before:** Feature implementation complete, tests passing
**After:** Fix findings → `/improve` → `/git-worker` for commit

## Resources

See [resources/](resources/) for:
- **risk-assessment.md** — General risk checklist and failure mode analysis
- **business-risk.md** — Revenue, user trust, legal, competitive analysis
- **it-risk.md** — Database, queries, caching, IT security, infrastructure
- **scalability.md** — Load analysis, growth ceilings, resource exhaustion
- **architecture.md** — NASA clean code rules, production readiness, dependency health
- **report-template.md** — Full report template with all sections
