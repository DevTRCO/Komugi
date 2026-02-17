# Dimension 1: Risk Assessment

## Purpose

Identify all failure modes, edge cases, error propagation paths, and data integrity risks.
Think like a failure analyst — find every way this code can break.

## Checklist

### 1.1 Error Handling Completeness

- Every async operation has error handling (no unhandled promise rejections)
- Every external call (API, DB, file system) has try/catch or Result type
- Error messages are actionable (not generic "something went wrong")
- Errors propagate correctly (not swallowed, not double-handled)
- Error boundaries exist for React component trees
- Partial failures are handled (e.g., 3 of 5 items fail to process)

### 1.2 Edge Cases

- Empty input / null / undefined handled at every entry point
- Array operations handle empty arrays (no `.reduce()` on empty without initial)
- String operations handle empty strings, whitespace-only, Unicode edge cases
- Numeric operations handle zero, negative, NaN, Infinity
- Date operations handle timezone differences, DST, invalid dates
- Concurrent access patterns handled (race conditions, stale data)
- Network timeout scenarios handled
- Rate limit exceeded scenarios handled gracefully

### 1.3 Data Integrity

- All database writes are transactional where atomicity is required
- Foreign key constraints match application-level assumptions
- Cascade delete/update behavior is intentional and documented
- No orphaned records possible from partial operation failure
- Data format migrations are backward-compatible

### 1.4 Failure Mode Analysis

For each critical path, answer:

- What happens if this external service is down?
- What happens if this query returns 0 results? 1 million results?
- What happens if this operation takes 30 seconds instead of 100ms?
- What happens if this runs twice (idempotency)?
- What happens if the user navigates away mid-operation?
- What happens if two users do this simultaneously?

### 1.5 Error Propagation Map

Trace error propagation from origin to user:

```
Error Origin → Handler → Transform → Response → User Experience
```

For each path, verify:

- Sensitive information is NOT leaked to the client
- The user gets a meaningful, actionable message
- The error is logged with enough context for debugging

## Severity Classification

| Finding | Grade |
|---------|-------|
| Unhandled promise rejection in AI flow | CRITICAL |
| Missing error boundary around AI generation | WARNING |
| Generic error message on form submission | CAUTION |
| Missing timeout on non-critical API call | CAUTION |
| Swallowed error in logging utility | WARNING |
| Race condition in screenshot capture | CRITICAL |
