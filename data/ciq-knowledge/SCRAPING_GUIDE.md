# CaptivateIQ Support Site Scraping Guide

## For Claude on Chrome (logged into CIQ support)

### Prerequisites
- Logged into https://support.captivateiq.com with a CaptivateIQ account
- Claude extension active in Chrome

### Priority Order (scrape Tier 1 first)

**Tier 1 — Critical for builds:**
1. Formula Library
2. Workbooks & Worksheets
3. Commission Plans
4. Components
5. Manage Data

**Tier 2 — Important:**
6. Global Attributes
7. Manage People
8. Payouts
9. Sales Planning

**Tier 3 — Nice to have:**
10. Statements
11. Reviews & Approvals
12. Reporting

**Tier 4 — Low priority:**
13. Plan Documents
14. Jobs & Audit Logs
15. Account Settings
16. Beta Content

### Instructions for Each Category

1. Navigate to https://support.captivateiq.com/hc/en-us
2. Click into the category (e.g., "Formula Library")
3. For each section within the category, click into it
4. For each article:
   - Read the full article content
   - Extract: title, URL, full content as markdown
   - Note any related articles or cross-references
   - Identify tags/keywords

5. Output as JSON in this format:

```json
{
  "category": "formula-library",
  "displayName": "Formula Library",
  "scrapedAt": "2026-03-03T...",
  "articles": [
    {
      "title": "VLOOKUP Formula",
      "url": "https://support.captivateiq.com/hc/en-us/articles/...",
      "content": "## VLOOKUP Formula\n\nThe VLOOKUP formula allows you to...",
      "tags": ["formula", "lookup", "vlookup"],
      "relatedConcepts": ["rate-table", "data-workbooks"]
    }
  ]
}
```

### Key Things to Capture

- **Formula syntax** — exact function signatures, parameter descriptions, return types
- **SmartGrid behavior** — how formulas execute, row-by-row processing, cross-sheet references
- **Worksheet configuration** — column types, source vs derived vs override
- **Plan setup steps** — how to create plans, add components, assign employees
- **Data import** — supported formats, upload process, validation rules
- **Common patterns** — frequently used formula combinations, best practices

### Storage

Save each category's JSON file to:
```
data/ciq-knowledge/categories/<category-id>.json
```

For example:
- `data/ciq-knowledge/categories/formula-library.json`
- `data/ciq-knowledge/categories/workbooks-worksheets.json`
- `data/ciq-knowledge/categories/commission-plans.json`

### After Scraping

Once articles are saved, the knowledge base will be used by the pipeline to:
1. Generate more accurate CIQ formulas
2. Validate worksheet configurations against real CIQ patterns
3. Ensure completeness of plan setup based on official requirements
4. Provide specific guidance in the Build Document
