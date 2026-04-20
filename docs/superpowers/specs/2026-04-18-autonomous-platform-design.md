# Autonomous Claude Code Platform — Design Spec

**Date:** 2026-04-18  
**Status:** Approved  
**Scope:** Full autonomous agent platform for OrienteerFeed monorepo — monitoring, GitHub automation, Discord bot, local AI, scheduled agents

---

## 1. Goals

- Utilize Claude Code to its full potential across all development and operations workflows
- Reduce manual management overhead via scheduled agents and automation
- Minimize Claude Code token consumption by routing appropriate tasks to cheaper/free models
- Enable interactive control of infrastructure via Discord commands
- Provide intelligent monitoring of DigitalOcean droplet, Proxmox k3s, and services

---

## 2. Infrastructure Overview

### Local machines

**MacBook (primary development)**
- Claude Code Max subscription (interactive development)
- MCP servers: Playwright, GitHub (viz `.claude/mcp.json`)
- Skills: TDD, debugging, code review, finishing branches
- Git / IDE

**i7 Ivy Bridge PC — Ubuntu Server 24.04 LTS (headless)**

OS choice rationale:
- Headless = maximum RAM for models (critical on 8-16GB)
- Ubuntu 24.04 LTS = best Ollama + Docker support, 5yr LTS (to 2029)
- Ivy Bridge has AVX but not AVX2 — llama.cpp auto-selects AVX build on Ubuntu

Services running on this machine:
```
Docker + Docker Compose
├── Ollama (CPU-only, AVX mode)
│   ├── qwen2.5:3b-instruct-q4_0    # 8GB RAM config: log analysis, summaries
│   └── qwen2.5:7b-instruct-q4_0    # 16GB RAM config: GitHub triage, reasoning
├── LiteLLM proxy (port 4000)        # bridges Ollama → OpenAI API format
├── Discord Bot (Python/Node.js)     # receives commands, sends alerts
└── Prometheus Node Exporter         # system metrics → Grafana on k3s
```

RAM guidance:
- 8GB: run qwen2.5:3b only (~3GB model + OS overhead)
- 16GB: run qwen2.5:7b or phi3.5:mini for better reasoning quality

### Cloud / Infra

**DigitalOcean Droplet**
- Docker Compose stack: Hono server, MariaDB, MinIO
- Prometheus metrics endpoint: `GET /metrics`
- SSH access for agent health checks

**Proxmox k3s cluster**
- Helm chart: `deploy/helm/ofeed`
- Grafana + Prometheus stack (to be deployed)
- Alertmanager → Discord webhook integration
- Loki for log aggregation (optional, Phase 2)

**GitHub**
- Issues and PRs as knowledge base via GitHub MCP
- CI: lint + type-check + test + build on every push/PR
- Release: semantic-release via labels / commit trailers
- Docker images: GHCR on `v*` tags

---

## 3. Model Routing Strategy

| Task | Model | Platform | Cost |
|---|---|---|---|
| Interactive development | Claude Sonnet 4.6 | Max subscription | flat rate |
| Complex architecture decisions | Claude Opus 4.7 | Max subscription | flat rate |
| Scheduled GitHub issue triage | Gemini 2.5 Flash | Google AI API | ~$0.075/1M tokens |
| Scheduled deploy health check | Gemini 2.5 Flash | Google AI API | low |
| PR review agent | Claude Haiku 4.5 | OpenRouter | low |
| Log analysis / daily summaries | Qwen2.5 3B (Ollama) | i7 PC | free |
| Discord bot reasoning | Qwen2.5 7B (Ollama) | i7 PC | free |
| Monitoring anomaly analysis | Gemini Flash / Ollama | mix | minimal |

### Why Claude Code Max (not lower tier)

- **200k context window**: large monorepo agent sessions consume 50-100k tokens easily
- **Subagents**: each starts fresh and re-reads context; rate limits on Pro/Team block workflows within 30 min of parallel agent work
- **MCP tool calls**: every Playwright screenshot, GitHub API call, DB query enters context and accumulates fast
- **Skills overhead**: each skill loads 2-5k tokens into context
- **Remote Triggers**: run on API tokens (outside subscription), so interactive sessions must not be rate-limited simultaneously
- **Cost break-even**: Max 5× ($100/mo) is cheaper than pay-per-token from ~2M tokens/month of interactive use

---

## 4. Agent Comparison

### Claude Code Max — primary tool
- Best multi-file editing in complex TypeScript monorepo
- Mature MCP ecosystem (Playwright, GitHub, Prisma, k8s)
- Skills/superpowers system (TDD, debugging, review, finishing branches)
- Native Remote Triggers for scheduled agents
- Subagents with isolated git worktrees
- 200k context
- Cons: most expensive interactive tier; scheduled triggers consume API tokens beyond subscription

### OpenAI Codex CLI
- Cheaper for simple tasks (o4-mini)
- Sandbox execution (safe code running)
- Works with OpenRouter for model switching
- Cons: no skills ecosystem, weaker on complex TypeScript, no native scheduling, immature MCP support
- **Use in this project**: one-off scripts, SQL migration generation

### Gemini CLI (Google)
- Gemini 2.5 Pro: 1M token context — best for large codebase exploration
- Gemini 2.5 Flash: very cheap ($0.075/1M input) — ideal for scheduled agents
- Google AI Studio free tier for experiments
- Google Search grounding for current documentation
- Cons: younger ecosystem, less consistent tool use, no native Remote Triggers
- **Use in this project**: ✅ scheduled monitoring agents, issue triage, log summarization

### Grok (xAI)
- Strong coding benchmarks, real-time X data
- Available via OpenRouter
- Cons: no CLI, no agent framework, no MCP — requires custom integrations
- **Use in this project**: not recommended

---

## 5. GitHub Workflow Automation

### MCP server setup (`.claude/mcp.json`)
Add GitHub MCP server so Claude can read/write issues and PRs directly from terminal session:
```json
"github": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": { "GITHUB_TOKEN": "<PAT with repo scope>" }
}
```

### Skills for daily workflow
```bash
# Before creating a PR:
/review              # Claude reads diff, writes structured review
/security-review     # scans for OWASP top 10, secrets, SQL injection

# After finishing a feature:
/finishing-a-development-branch   # structured merge vs PR decision
```

### Scheduled agents (Remote Triggers via Anthropic API)
| Schedule | Agent | Model | Action |
|---|---|---|---|
| Daily 08:00 | GitHub issue triage | Gemini 2.5 Flash | Labels new issues, assigns priority, posts summary to Discord |
| Daily 08:05 | Deployment health check | Gemini Flash | SSH to DO droplet, check k3s pods, post report to #monitoring |
| Weekly Mon 09:00 | PR review summary | Claude Haiku 4.5 | Summarizes open PRs, flags stale ones, posts to Discord |
| On push to main | Post-deploy check | Gemini Flash | Verify services healthy after deployment |

### E2E tests in CI
Add Playwright job to `.github/workflows/ci.yaml` running on Chromium only (fast) after the existing `validate` job passes. Upload HTML report as artifact on failure.

---

## 6. Monitoring Architecture

### Stack on Proxmox k3s
```
Prometheus          scrapes /metrics from server + Node Exporter on i7 PC
Grafana             dashboards for API latency, DB connections, k3s pods
Alertmanager        routing rules → Discord webhooks per channel
Loki (Phase 2)      log aggregation from all services
```

Server already exposes `GET /metrics` (Prometheus format) — zero additional instrumentation needed.

### Alertmanager → Discord routing
```
#monitoring-alerts   CPU >80%, memory >90%, pod crash loop, disk >85%
#deploys             new deployment events, rollbacks
#errors              5xx spike, DB connection failures
```

### Claude agent in monitoring loop
When Alertmanager fires a critical alert:
1. Alertmanager sends to Discord webhook
2. Discord bot receives → triggers Gemini Flash agent
3. Agent SSHes to server, reads last 100 lines of relevant service log
4. Posts human-readable diagnosis to Discord thread under the alert

---

## 7. Discord Bot — Commands

Bot runs on i7 PC (Python, discord.py or Node.js discord.js).

| Command | Action | Model used |
|---|---|---|
| `!status` | Health check DO + k3s — pods, services, disk, RAM | Ollama Qwen3B |
| `!deploy` | Trigger latest image pull + Helm upgrade on k3s | shell script |
| `!issues` | List top 5 open GitHub issues by priority | Ollama / Gemini Flash |
| `!report` | Full daily summary: deployments, errors, open PRs | Gemini Flash |
| `!logs [service] [n]` | Last N lines from service log, summarized | Ollama Qwen3B |
| `!restart [service]` | Restart Docker/k3s service | shell script |
| `!gitlog` | Last 5 commits with conventional commit summary | Ollama Qwen3B |

Security: commands restricted to specific Discord role/channel. Destructive commands (`!deploy`, `!restart`) require confirmation reply.

---

## 8. Signal / WhatsApp — Why Not (reference note)

| Platform | Setup complexity | Extra infra needed | Recommended |
|---|---|---|---|
| Discord | Low (10 min) | None | ✅ |
| Signal | High (2-4h) | signal-cli Docker container, dedicated phone number | Only if E2E encryption required |
| WhatsApp | Very high | Meta Business API approval, webhook server with SSL | ❌ Not suitable for hobby project |

---

## 9. Phased Implementation

### Phase 1 — Foundation (1-2 days)
- [ ] Ubuntu Server 24.04 on i7 PC + Docker
- [ ] Ollama + qwen2.5:3b + LiteLLM proxy
- [ ] GitHub MCP in `.claude/mcp.json`
- [ ] Discord bot basic setup (webhook + bot token)
- [ ] Playwright E2E added to CI

### Phase 2 — Automation (2-3 days)
- [ ] Scheduled agents via Anthropic API Remote Triggers (daily triage, deploy check)
- [ ] Discord bot commands: `!status`, `!issues`, `!report`, `!logs`
- [ ] Grafana + Prometheus on k3s (scraping existing `/metrics` endpoint)
- [ ] Alertmanager → Discord routing rules

### Phase 3 — Full Autonomous (2-3 days)
- [ ] n8n on Proxmox for workflow orchestration
- [ ] Claude agent in monitoring alert loop
- [ ] Loki log aggregation
- [ ] `!deploy` and `!restart` commands with confirmation flow
- [ ] Weekly PR review scheduled agent

---

## 10. Cost Estimate (monthly)

| Item | Cost |
|---|---|
| Claude Code Max 5× | $100 |
| Google AI API (Gemini Flash, scheduled agents) | ~$2-5 |
| OpenRouter (Haiku, PR review) | ~$3-8 |
| Ollama / i7 PC | $0 (electricity only) |
| Discord bot hosting (i7 PC) | $0 |
| **Total** | **~$105-115/month** |

Without Claude Code Max (API only): estimated $80-150/month depending on usage intensity — Max subscription becomes more cost-effective above ~2M tokens/month.
