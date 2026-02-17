# Dimension 2: Business Risk

## Purpose

Assess how code issues translate to business impact: user trust erosion, legal liability,
and competitive exposure. Technical bugs are symptoms — business impact is the disease.

## Checklist

### 2.1 User Trust

- User data is never exposed unintentionally
- AI-generated content is clearly from AI (no impersonation)
- Personal data (screenshots, chat history) stays local — never transmitted beyond Gemini API
- Account/data deletion actually deletes data
- Error states don't expose internal system details
- AI interactions produce helpful, non-harmful content
- Screenshots are not persisted longer than necessary

### 2.2 Legal Liability

- GDPR compliance: data portability, right to deletion
- AI content generation has appropriate disclaimers
- No copyright-infringing content generation vectors
- Data retention policies are implemented and enforced
- Screenshots may contain sensitive content — handle appropriately
- Gemini API usage complies with Google's Terms of Service

### 2.3 Competitive Exposure

- API keys not exposed to client-side JavaScript (only via Rust backend or .env)
- AI prompts / system instructions not extractable from build artifacts
- Source maps disabled in production
- No information disclosure in error messages

### 2.4 Abuse Vectors

- AI features can't be used to generate harmful content
- Rate limiting on resource-intensive operations (session message limit)
- Content generation has appropriate guardrails (system prompt)
- Prompt injection via screenshot content is mitigated
- No way to bypass session message limits

## Komugi-Specific Risks

| Finding | Trust Impact | Legal Risk | Timeline |
|---------|-------------|------------|----------|
| Screenshot data leak | Catastrophic | Critical | Immediate |
| API key exposure | High | Medium | Days |
| Prompt injection via screenshot | Medium | Low | Weeks |
| Unbounded API costs | Low | Low | Months |

## Counterfactual Template

For each business risk finding:

```
WITHOUT THIS ASSESSMENT:
- Probability of occurring: {X}% within {timeframe}
- User trust impact: {description}
- Time to discover: {days/weeks/months}
- Cost to fix post-incident: {X}x cost of fixing now
```
