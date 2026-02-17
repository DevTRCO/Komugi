# Dimension 3: IT Risk

## Purpose

Assess database efficiency, query performance, IT security posture, and infrastructure health.
The invisible backbone that either enables or destroys the product.

## Checklist

### 3.1 Database Efficiency (SQLite)

- All queries use appropriate indexes
- No N+1 query patterns (especially in list/collection views)
- Queries are bounded (LIMIT clauses, pagination)
- No SELECT * — only needed columns are fetched
- Joins are efficient (indexed foreign keys)
- Database connections are properly managed (open/close lifecycle)
- Migrations are backward-compatible
- Dead/unused columns and tables are identified

### 3.2 Query Performance

- Identify queries with execution time > 100ms
- Check for sequential scans on tables > 10K rows
- Verify index usage matches query patterns
- Fulltext search uses appropriate SQLite FTS extension or LIKE with indexes
- Connection handling appropriate for concurrent access

### 3.3 IT Security

- All Tauri commands validate input before processing
- No injection vectors (SQL injection via user input in search)
- Prompt injection: user input in screenshots/questions sanitized before API call
- API keys stored in .env, never committed to git
- Tauri capabilities are minimal per window (principle of least privilege)
- CSP headers prevent XSS
- No sensitive data in URLs or logs
- File system access scoped to app data directory

### 3.4 Infrastructure Health

- Environment variables validated at startup (fail fast if GEMINI_API_KEY missing)
- Structured logging with appropriate levels
- No PII in logs (no screenshot content in logs)
- Error monitoring configured
- Graceful degradation when Gemini API is unavailable

### 3.5 Data Protection

- Screenshots stored only in memory (Zustand) during active session
- SQLite database in app data directory (OS-protected)
- No sensitive data in localStorage (except theme preference)
- Base64 screenshots in SQLite are local-only
- API responses don't persist beyond session scope (except history)

## Severity Classification

| Finding | Grade |
|---------|-------|
| SQL injection vector in search | ABORT |
| Missing input validation on Tauri command | CRITICAL |
| N+1 query on session list | WARNING |
| Missing index on frequently queried column | WARNING |
| PII in application logs | CRITICAL |
| API key in committed code | ABORT |
