# Available Services & Platforms

> Copied from ~/.claude/templates/services.md. Edit this copy for project-specific notes.

## Search & Knowledge

### QMD (Query Markup Document)
Local hybrid BM25 + vector search engine.
- Index: `~/.cache/qmd/index.sqlite`
- `qmd search "query" -n 10 --collection <name>` — keyword search
- `qmd query "query" -n 5 --collection <name>` — semantic + reranking
- `qmd collection update --name <name>` — re-index
- Collections can be created per project

## Communication & Data (MCP)

### Microsoft 365
Available in Claude Code sessions via MCP:
- `outlook_calendar_search` — events, attendees, times
- `outlook_email_search` — email threads, attachments
- `sharepoint_search` / `sharepoint_folder_search` — documents
- `chat_message_search` — Teams messages
- `read_resource` — full content of any M365 resource by URI

### Granola
Meeting transcript MCP. Transcripts auto-cached locally.
- Access full transcripts beyond vault notes
- Verify what was said in meetings

### Smartsheet
Project plans and RAID logs via MCP. Reference layer — may be outdated.

## Development Platforms

### GitHub
All BHG repos under organization. Claude Code has full git access.

### AICR Platform
Enterprise AI governance platform (BHG internal product).
- Core repo: `~/Desktop/BHG Repos/AICR/`
- Monorepo: `apps/` (Next.js), `packages/` (shared libs), `services/` (Go microservices)
- Hosted on Vercel (prod), Cloudflare (domains/demos), fly.io (Go services)

**Go Microservices** (`services/`):
- `gateway-api` — API gateway, routes to downstream services
- `identity-svc` — auth, users, orgs
- `policy-svc` — AI governance policies, rules engine
- `audit-svc` — compliance audit trails
- `oversight-svc` — human-in-the-loop review workflows
- `knowledge-svc` — RAG, document ingestion
- `research-svc` — AI research orchestration
- `eval-svc` — model evaluation framework
- `ai-gateway-svc` — LLM proxy, rate limiting, token tracking
- `usage-svc` — metering and usage analytics
- `storage-svc` — file/document storage
- `document-svc` — document processing
- `email-svc` — transactional email
- `event-bus` — NATS-based async messaging
- `pulse-svc` — health/telemetry
- `prizym-engine-svc` — comp plan calculation engine
- `scoping-svc` — project scoping
- `demo-svc` — demo environment management
- `deploy-svc` — deployment orchestration
- `design-svc` — design system service
- `dispute-svc` — dispute resolution workflows
- `integration-tests` — cross-service test suite
- Shared: `pkg/` (common Go libs), `proto/` (protobuf definitions), `gen/` (generated code)
- Build: `make` via root `Makefile`, Go workspace (`go.work`)

### BHG Ops Center
CIQ Operations Center at `~/Desktop/BHG Workspace/`.
- Dashboard: `http://localhost:4317`
- Obsidian vault + opsfs state layer + automation scripts
- Run `/orient` from that directory for full context

## Infrastructure

### Vercel
Production hosting for web apps. Deploy via `vercel` CLI or git push.

### Cloudflare
DNS and domain management for demos.

### Mac Mini (local server)
- Host: `user@users-Mac-mini.local`
- Used for: local services
