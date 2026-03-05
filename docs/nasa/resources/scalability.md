# Dimension 4: Scalability

## Purpose
Identify growth ceilings, resource exhaustion risks, and architectural bottlenecks that will break at scale. The question isn't "does it work?" — it's "will it still work at 10x, 100x, 1000x?"

## Checklist

### 4.1 Load Analysis
- [ ] Identify the highest-traffic endpoints in scope
- [ ] Estimate current request volume and projected growth
- [ ] Check if hot paths are optimized (no unnecessary computation)
- [ ] Verify response times under simulated load
- [ ] Identify synchronous bottlenecks that could be async
- [ ] Check for blocking operations in request paths (file I/O, heavy computation)
- [ ] Verify WebSocket/SSE connections are bounded and cleaned up
- [ ] Check for memory leaks in long-running processes

### 4.2 Growth Ceilings
- [ ] Database row counts: which tables will hit millions first?
- [ ] Query performance: do queries degrade linearly, logarithmically, or quadratically with data size?
- [ ] Storage growth: are we storing data that grows unboundedly? (chat history, logs, generated content)
- [ ] File storage: Vercel Blob limits, cleanup policies
- [ ] API rate limits: third-party service limits (ElevenLabs, OpenAI, Stripe)
- [ ] Compute limits: Vercel serverless function timeouts (10s default, 60s max)
- [ ] Database connections: Neon connection pooling limits
- [ ] Memory: serverless function memory limits

### 4.3 Resource Exhaustion
- [ ] Every loop has a bounded iteration count
- [ ] Every query has a LIMIT clause or pagination
- [ ] Every API call has a timeout
- [ ] Every retry has a maximum count with exponential backoff
- [ ] Every queue/buffer has a maximum size
- [ ] Every file upload has a size limit
- [ ] Every text input has a length limit
- [ ] Every concurrent operation has a concurrency limit
- [ ] Memory-intensive operations stream instead of buffer
- [ ] Large result sets are paginated, not loaded entirely

### 4.4 Bottleneck Identification
Map the critical path and identify:

```
Request → [Auth Check] → [DB Query] → [AI Processing] → [Storage] → Response
              │               │              │               │
         Bottleneck?     Bottleneck?    Bottleneck?     Bottleneck?

For each step:
- Current latency: ___ms
- Latency at 10x load: ___ms
- Latency at 100x load: ___ms
- Breaking point: ___ concurrent requests
```

- [ ] Database queries: are they the bottleneck? Can they be cached?
- [ ] AI generation: queue-based or synchronous? What happens when 100 users generate simultaneously?
- [ ] File storage: write amplification? Read-heavy or write-heavy?
- [ ] Authentication: session lookup performance at scale
- [ ] Third-party APIs: rate limits, latency, fallback behavior

### 4.5 Horizontal Scaling Readiness
- [ ] No server-local state (everything in DB or external cache)
- [ ] No file system assumptions (works on ephemeral serverless)
- [ ] Session management works across multiple instances
- [ ] Database supports read replicas if needed
- [ ] Cache layer can be distributed (not in-process only)
- [ ] Background jobs can run on separate workers
- [ ] No hardcoded single-instance assumptions

### 4.6 Cost Scaling
- [ ] AI API costs scale linearly with users (not quadratically)
- [ ] Database costs are predictable (no runaway queries)
- [ ] Storage costs have cleanup/retention policies
- [ ] CDN/bandwidth costs are optimized (proper caching headers)
- [ ] No "hidden" cost multipliers (e.g., logging to paid service at high volume)

## Scalability Tiers

| Tier | Users | Requests/min | Data Size | Expected Issues |
|------|-------|-------------|-----------|-----------------|
| Current | <100 | <50 | <1GB | None expected |
| Growth | 100-1K | 50-500 | 1-10GB | Query perf, cache miss storms |
| Scale | 1K-10K | 500-5K | 10-100GB | Connection limits, API rate limits |
| Breakout | 10K+ | 5K+ | 100GB+ | Architecture changes needed |

For each finding, classify which tier it breaks at and what the failure mode is.

## Severity Classification

| Finding | Grade |
|---------|-------|
| Unbounded query on table growing 10K rows/day | CRITICAL |
| No pagination on chat history endpoint | WARNING |
| Synchronous AI generation blocking request | WARNING |
| No rate limit on resource-intensive endpoint | WARNING |
| In-memory caching only (no distributed cache) | CAUTION |
| Missing CDN caching headers on static assets | CAUTION |
| Third-party API with no fallback strategy | WARNING |
