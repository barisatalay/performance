# performance

A self-auditing Claude Code plugin that silently tracks which skills (slash commands) you use during a session, then reports what you used and what you missed — via a fast Haiku agent. Zero configuration required: install and it works.

---

## What It Does

During every Claude Code session, performance:

- Collects tool-use events into a JSONL log
- Injects a reminder at session start and before compaction so the assistant stays aware
- Guards `git commit` operations — if you haven't run the audit yet, the commit is blocked until you do
- On demand (or at commit time), runs a two-stage analysis: the main model pre-filters the skill catalog to the ~5–10 most relevant candidates, then a Haiku subagent produces a clean three-table report

The output is always in Turkish — three tables covering used skills, missed skills, and the MOC (Map of Content) flow for the session.

---

## Installation

**Add marketplace:**
```bash
/plugin marketplace add barisatalay/performance
```

**Install plugin:**
```bash
/plugin install performance@performance
```

**Update:**
```bash
/plugin marketplace update
```

No further setup is needed. The plugin registers its hooks and skill automatically.

---

## How It Works

```
Session Start
     │
     ▼
┌─────────────────────────┐
│  skill-analysis-session  │  SessionStart hook
│  Injects context reminder│  PreCompact hook
└─────────────────────────┘
     │
     ▼ (every tool use)
┌─────────────────────────┐
│  skill-tracker-post      │  PostToolUse hook
│  Appends event to JSONL  │
└─────────────────────────┘
     │
     ▼ (on git commit)
┌─────────────────────────┐
│  skill-audit-reminder    │  PreToolUse hook
│  Blocks commit if audit  │
│  has not been run        │
└─────────────────────────┘
     │
     ▼ (manual or forced)
┌─────────────────────────┐
│  /skill-analysis skill   │  Two-stage analysis
│  Main model pre-filters  │
│  → Haiku produces tables │
└─────────────────────────┘
```

### Hooks

| Hook file | Event | Purpose |
|---|---|---|
| `skill-tracker-post.mjs` | PostToolUse | Appends each tool-use event to `skill-tracker.jsonl` |
| `skill-analysis-session.mjs` | SessionStart, PreCompact | Writes session ID and injects skill-awareness reminder (survives context compaction) |
| `skill-audit-reminder.mjs` | PreToolUse (Bash) | Intercepts `git commit`; blocks if audit flag is absent |

The `hooks/hooks.json` file registers all three hooks with the Claude Code harness.

### Skill

| Skill | Trigger | What it does |
|---|---|---|
| `/skill-analysis` | Manual or commit guard | Reads JSONL log, pre-filters catalog, delegates to Haiku for final tables |

---

## Usage

### Automatic

1. Start a Claude Code session — the reminder is injected automatically.
2. Work normally. Every tool call is logged in the background.
3. When you run `git commit`, the commit guard checks whether the audit has been run. If not, it blocks the commit and tells you to run `/skill-analysis` first.

### Manual

At any point during or after a session:

```
/skill-analysis
```

This triggers the two-stage analysis and prints the three-table report directly in the conversation.

### Output

The report is always produced in Turkish and contains three tables:

- **Tablo 1** — Kullanılan Skill'ler: skills that were actually used, with their purpose
- **Tablo 2** — Kaçırılan Skill'ler: skills that could have been used but weren't, with justification
- **Tablo 3** — MOC Akışı: the Map of Content flow for the session, linking topics to relevant files

---

## Example Output

```
## Skill Analiz Raporu

### Tablo 1: Kullanılan Skill'ler

| Skill | Kullanım Amacı |
|---|---|
| /commit | Değişiklikleri git'e kaydetmek için kullanıldı |
| /simplify | Yeni eklenen hook kodunu sadeleştirmek için çalıştırıldı |
| /review-pr | PR açılmadan önce değişiklikler gözden geçirildi |

### Tablo 2: Kaçırılan Skill'ler

| Skill | Neden Gerekli? |
|---|---|
| /test-driven-development | Yeni hook fonksiyonları için birim testler yazılmadan önce kullanılmalıydı |
| /writing-plans | Çok adımlı görev öncesinde plan oluşturmak için faydalı olurdu |

### Tablo 3: MOC Akışı

| MOC | İlgili Dosyalar |
|---|---|
| Hook Sistemi | hooks/skill-tracker-post.mjs, hooks/hooks.json |
| Skill Tanımı | skills/skill-analysis/SKILL.md |
| Yapılandırma | .claude-plugin/plugin.json |
```

---

## Plugin File Structure

```
performance/
├── .claude-plugin/
│   └── plugin.json               # Plugin manifest (name, version, hooks, skills)
├── hooks/
│   ├── hooks.json                # Hook registration for the Claude Code harness
│   ├── skill-tracker-post.mjs    # PostToolUse: logs tool events to JSONL
│   ├── skill-audit-reminder.mjs  # PreToolUse: blocks git commit if audit not run
│   └── skill-analysis-session.mjs# SessionStart + PreCompact: injects reminders
├── skills/
│   └── skill-analysis/
│       └── SKILL.md              # /skill-analysis skill definition
├── README.md                     # This file (English)
└── README.tr.md                  # Turkish documentation
```

---

## Two-Stage Analysis

Sending the full skill catalog (60+ entries) to Haiku for every session would produce noisy, unfocused output. performance uses a two-stage approach:

**Stage 1 — Pre-filter (main model)**

The main model reads the list of files edited during the session and reasons about which ~5–10 skills from the catalog are actually relevant to that work. This produces a short, focused candidate list.

**Stage 2 — Report (Haiku agent)**

The Haiku subagent receives only the candidate list alongside the raw JSONL log. It compares actual tool usage against the candidates and produces the final three-table report. Because the input is small and focused, Haiku's output is precise and fast.

This design keeps latency low, cost minimal, and output quality high — regardless of how large the global skill catalog grows.

---

## Runtime State Files

The plugin stores session state in the **project's** `.claude/hooks/state/` directory, not in the plugin root. This keeps state isolated per project and avoids polluting the plugin installation.

| File | Purpose |
|---|---|
| `skill-tracker.jsonl` | Append-only log of all tool-use events for the current session |
| `skill-tracker-session.txt` | Current session ID, written at SessionStart |
| `skill-audit-flag.json` | Written when the audit completes; read by the commit guard |

These files are created automatically on first use. You can safely delete them to reset the state for a session.

---

## Troubleshooting

### Commit is blocked but I already ran `/skill-analysis`

The commit guard reads `skill-audit-flag.json` in `.claude/hooks/state/`. If the file is missing, the guard blocks. Possible causes:

- The skill did not complete successfully — check for errors in the conversation.
- The state directory does not exist yet — it is created on first SessionStart. Try starting a new session.
- You are running `git commit` from a different working directory than where the session was started.

**Fix:** Run `/skill-analysis` again in the current session. If the problem persists, manually create the flag file:
```bash
echo '{"sessionId":"manual","auditRanInSession":true,"blockShownInSession":false}' > .claude/hooks/state/skill-audit-flag.json
```

### No JSONL data — tables are empty

The `skill-tracker-post.mjs` hook was not triggered. Possible causes:

- The plugin was installed after the current session started. Restart Claude Code.
- The hooks are not registered. Check `hooks/hooks.json` and verify the plugin is listed in `claude plugin list`.

### Haiku subagent produces an error

The two-stage analysis spawns a subagent using the Claude API. Ensure:

- Your `ANTHROPIC_API_KEY` environment variable is set.
- You have access to the `claude-haiku` model tier in your Anthropic account.

### Turkish characters appear garbled

Ensure your terminal and editor are set to UTF-8. The output uses ş, ç, ğ, ı, ö, ü characters throughout.
