# Dimension 3: IT Risk

## Purpose
Assess database efficiency, query performance, caching strategy, IT security posture, and infrastructure health. The invisible backbone that either enables or destroys the product.

## Checklist

### 3.1 Database Efficiency
- [ ] All queries use appropriate indexes (no sequential scans on large tables)
- [ ] No N+1 query patterns (especially in list/collection endpoints)
- [ ] Queries are bounded (LIMIT clauses, pagination)
- [ ] No `SELECT *` — only needed columns are fetched
- [ ] Joins are efficient (indexed foreign keys, appropriate join types)
- [ ] Aggregation queries use materialized views or pre-computed values where appropriate
- [ ] Database connections are pooled (Neon connection pooling verified)
- [ ] Query timeouts are set for all database operations
- [ ] Migrations are backward-compatible (no locking migrations on large tables)
- [ ] Dead/unused columns and tables are identified

### 3.2 Query Performance
- [ ] Run `EXPLAIN ANALYZE` on all queries in scope
- [ ] Identify queries with cost > 1000 or actual time > 100ms
- [ ] Check for sequential scans on tables > 10K rows
- [ ] Verify index usage matches query patterns (composite indexes in correct order)
- [ ] Check for implicit type casts preventing index usage
- [ ] Verify `unstable_cache` TTLs match data change frequency
- [ ] Cache invalidation strategy exists and is correct
- [ ] No cache stampede potential (staggered TTLs or locking)
- [ ] Connection pool size appropriate for concurrent load

### 3.3 IT Security
- [ ] All API endpoints require authentication (unless intentionally public)
- [ ] Authorization checks verify resource ownership (not just authentication)
- [ ] SQL injection: all queries use parameterized statements
- [ ] XSS: all user-generated content is escaped/sanitized on output
- [ ] CSRF: protection on all state-changing endpoints
- [ ] Rate limiting on authentication endpoints (login, register, password reset)
- [ ] Rate limiting on resource-intensive endpoints (AI generation, search)
- [ ] Security headers present (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- [ ] CORS configuration is restrictive (not `*`)
- [ ] No sensitive data in URLs (tokens, passwords, PII in query strings)
- [ ] Session tokens have appropriate entropy and expiration
- [ ] Password hashing uses bcrypt/argon2 with appropriate rounds
- [ ] Secrets are in environment variables, not committed to git
- [ ] Dependencies have no known critical vulnerabilities
- [ ] File uploads (if any) validate type, size, and content

### 3.4 Infrastructure Health
- [ ] Environment variables are validated at startup (fail fast)
- [ ] Health check endpoint exists and verifies downstream dependencies
- [ ] Logging is structured (JSON) with appropriate levels
- [ ] No PII in logs
- [ ] Error monitoring is configured (Sentry or equivalent)
- [ ] Database backup strategy exists and is tested
- [ ] Deployment is zero-downtime (rolling updates)
- [ ] Rollback procedure exists and has been tested
- [ ] DNS and SSL certificates are monitored for expiration
- [ ] CDN / edge caching configured correctly

### 3.5 Data Protection
- [ ] PII is encrypted at rest
- [ ] Database connections use TLS
- [ ] Backups are encrypted
- [ ] Access to production data is restricted and audited
- [ ] Data retention policies are enforced automatically
- [ ] Soft-delete vs hard-delete strategy is intentional
- [ ] No sensitive data in client-side storage (localStorage, cookies)
- [ ] API responses don't over-expose data (no extra fields "just in case")

## Database Analysis Protocol

When assessing database efficiency, use Neon MCP tools:

1. **List tables**: `get_database_tables` on dev branch
2. **Check schemas**: `describe_table_schema` for each table in scope
3. **Analyze queries**: `explain_sql_statement` for all queries
4. **Check slow queries**: `list_slow_queries` for production patterns
5. **Verify indexes**: Cross-reference query patterns with existing indexes

**CRITICAL**: Always use development branch `br-delicate-cloud-agsw58lt`. Never touch production.

## Severity Classification

| Finding | Grade |
|---------|-------|
| SQL injection vector | ABORT |
| Missing auth on API endpoint | CRITICAL |
| N+1 query on paginated list | WARNING |
| Missing index on frequently queried column | WARNING |
| Cache TTL too long for volatile data | CAUTION |
| No rate limiting on search endpoint | WARNING |
| PII in application logs | CRITICAL |
| Unencrypted database connection | CRITICAL |
