# Dimension 2: Business Risk

## Purpose
Assess how code issues translate to business impact: revenue loss, user trust erosion, legal liability, and competitive exposure. Technical bugs are only symptoms — business impact is the disease.

## Checklist

### 2.1 Revenue Impact
- [ ] Payment processing code handles all Stripe webhook edge cases
- [ ] Subscription state transitions are atomic and idempotent
- [ ] Free tier limits are enforced server-side (not just client-side)
- [ ] No way to access paid features without valid subscription
- [ ] Billing cycles handle timezone/DST correctly
- [ ] Refund/cancellation flow doesn't leave inconsistent state
- [ ] Trial periods expire correctly and convert properly
- [ ] Price changes propagate correctly to existing subscribers
- [ ] No revenue leakage from race conditions in subscription checks
- [ ] Promotional codes / discounts validate correctly

### 2.2 User Trust
- [ ] User data is never exposed to other users (tenant isolation)
- [ ] AI-generated content is clearly labeled as AI
- [ ] Personal data is encrypted at rest and in transit
- [ ] Account deletion actually deletes data (GDPR right to erasure)
- [ ] Password reset flow is secure (no enumeration, time-limited tokens)
- [ ] Session management prevents hijacking
- [ ] User consent is collected before data processing
- [ ] Error states don't expose internal system details
- [ ] AI interactions are appropriately moderated
- [ ] User-reported content is handled promptly

### 2.3 Legal Liability
- [ ] Terms of Service are enforceable for AI-generated content
- [ ] GDPR compliance: data portability, right to deletion, consent tracking
- [ ] CCPA compliance: do-not-sell, privacy notice
- [ ] COPPA considerations: age verification if applicable
- [ ] AI content generation has appropriate disclaimers
- [ ] No copyright-infringing content generation vectors
- [ ] Data retention policies are implemented and enforced
- [ ] Third-party data sharing is disclosed and consented
- [ ] Accessibility standards met (ADA/WCAG)

### 2.4 Competitive Exposure
- [ ] API keys, internal endpoints not exposed to client
- [ ] AI prompts / system instructions not extractable
- [ ] Business logic not reverse-engineerable from API responses
- [ ] Rate limiting prevents automated scraping
- [ ] No information disclosure in error messages
- [ ] Source maps disabled in production
- [ ] Internal tooling not accessible from public routes

### 2.5 Abuse Vectors
- [ ] AI features can't be used to generate harmful content
- [ ] No way to create fake subscriptions or bypass payment
- [ ] Rate limiting on all resource-intensive operations
- [ ] Content generation has appropriate guardrails
- [ ] User-generated content (if any) is sanitized
- [ ] No way to enumerate users, subscriptions, or internal data
- [ ] Prompt injection via user profiles / memory is mitigated

## Impact Matrix

| Finding | Revenue Impact | Trust Impact | Legal Risk | Timeline |
|---------|---------------|-------------|------------|----------|
| Subscription bypass | Direct loss | Low (invisible) | Medium | Immediate |
| Data leak | Indirect | Catastrophic | Critical | Days |
| AI content abuse | Indirect | High | High | Weeks |
| Payment race condition | Direct loss | Medium | Low | Random |
| Missing GDPR deletion | None | Medium | Critical | Audit |

## Counterfactual Template

For each business risk finding:
```
WITHOUT THIS ASSESSMENT:
- Probability of occurring: {X}% within {timeframe}
- Revenue impact: ${amount} per incident
- User trust impact: {description}
- Time to discover: {days/weeks/months}
- Cost to fix post-incident: {X}x cost of fixing now
- Regulatory risk: {description}
```
