# Dimension 4: Scalability

## Purpose

Identify growth ceilings, resource exhaustion risks, and bottlenecks.
The question isn't "does it work?" — it's "will it still work at 10x, 100x?"

## Checklist

### 4.1 Load Analysis

- Identify the most resource-intensive operations
- Check if hot paths are optimized (no unnecessary computation)
- Identify synchronous bottlenecks that could be async
- Check for blocking operations (file I/O, heavy computation in UI thread)
- Check for memory leaks in long-running processes
- WebView memory usage with large screenshots

### 4.2 Growth Ceilings

- SQLite row counts: sessions and messages tables growth over time
- Query performance: do queries degrade with data size?
- Storage growth: Base64 screenshots in SQLite grow unboundedly
- Gemini API rate limits and quota
- Memory: large screenshots as Base64 strings in Zustand
- SQLite database file size limits

### 4.3 Resource Exhaustion

- Every loop has a bounded iteration count
- Every query has a LIMIT clause or pagination
- Every API call has a timeout
- Every retry has a maximum count with exponential backoff
- Session message limit enforced (max 15)
- Screenshot Base64 size has an upper bound
- Chat history pagination for large session counts
- Memory-intensive operations stream instead of buffer

### 4.4 Bottleneck Identification

```
Screenshot Capture → Base64 Encode → Store → Send to Gemini → Stream Response → Render
     │                    │              │          │                │             │
 Bottleneck?         Bottleneck?    Bottleneck? Bottleneck?    Bottleneck?   Bottleneck?
```

For each step:
- Current latency: ___ms
- Latency at 100 sessions: ___ms
- Breaking point: ___ concurrent operations

### 4.5 Cost Scaling

- Gemini API costs scale linearly with usage
- Large screenshots increase token count (and cost) per API call
- No "hidden" cost multipliers (e.g., sending full chat history each time)
- Screenshot resolution/compression tradeoff documented

## Scalability Tiers (Komugi-specific)

| Tier | Sessions | Messages | DB Size | Expected Issues |
|------|----------|----------|---------|-----------------|
| Light | <100 | <1K | <50MB | None expected |
| Regular | 100-1K | 1K-10K | 50-500MB | Query perf on search |
| Heavy | 1K-10K | 10K-100K | 500MB-5GB | SQLite limits, storage |
| Power | 10K+ | 100K+ | 5GB+ | Need cleanup/archival |

## Severity Classification

| Finding | Grade |
|---------|-------|
| Unbounded screenshot storage | WARNING |
| No pagination on history list | WARNING |
| Synchronous AI generation blocking UI | WARNING |
| No timeout on Gemini API call | WARNING |
| Missing cleanup for old sessions | CAUTION |
