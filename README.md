# performance

> **[Turkce dokumantasyon icin tiklayiniz / Turkish documentation](README.tr.md)**

A self-auditing Claude Code plugin that silently tracks which skills (slash commands) you use during a session, then reports what you used and what you missed — via a fast Haiku agent. Zero configuration required: install and it works.

---

## What It Does

During every Claude Code session, performance:

- Collects tool-use events into a JSONL log
- Injects a reminder at session start and before compaction so the assistant stays aware
- Guards `git commit` operations — if you haven't run the audit yet, the commit is blocked until you do
- On demand (or at commit time), runs a two-stage analysis: the main model pre-filters the skill catalog to the ~5–10 most relevant candidates, then a Haiku subagent produces a clean three-table report

The output language is automatically detected from the user's recent messages — three tables covering used skills, missed skills, and the MOC (Map of Content) flow for the session.

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
│  Resets audit flag       │  PreCompact hook
│  Injects context reminder│
└─────────────────────────┘
     │
     ▼ (every tool use)
┌─────────────────────────┐
│  skill-tracker-post      │  PostToolUse hook
│  Appends event to JSONL  │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
│  On TaskUpdate(completed)│
│  → Injects audit trigger │
│    if not already run    │
└─────────────────────────┘
     │
     ▼ (on git commit)
┌─────────────────────────┐
│  skill-audit-reminder    │  PreToolUse hook
│  Blocks commit if audit  │
│  has not been run        │
└─────────────────────────┘
     │
     ▼ (auto-triggered or manual)
┌─────────────────────────┐
│  /skill-analysis skill   │  Two-stage analysis
│  Main model pre-filters  │
│  → Haiku produces tables │
└─────────────────────────┘
```

### Hooks

| Hook file | Event | Purpose |
|---|---|---|
| `skill-tracker-post.mjs` | PostToolUse | Appends each tool-use event to `skill-tracker.jsonl`. Tracks parent and subagent tool calls equally. Auto-triggers skill-analysis reminder when a task is completed |
| `skill-analysis-session.mjs` | SessionStart, PreCompact | Writes session boundary marker to JSONL (only on SessionStart), resets audit flag, and injects skill-awareness reminder (survives context compaction) |
| `skill-audit-reminder.mjs` | PreToolUse (Bash, Skill) | Intercepts `git commit` and skill invocations; blocks if audit flag is absent |

The `hooks/hooks.json` file registers all three hooks with the Claude Code harness.

### Skill

| Skill | Trigger | What it does |
|---|---|---|
| `/skill-analysis` | Manual or commit guard | Reads JSONL log, pre-filters catalog, delegates to Haiku for final tables |

---

## Usage

### Automatic

1. Start a Claude Code session — the reminder is injected and the audit flag is reset.
2. Work normally. Every tool call is logged in the background.
3. When a task is marked as completed via `TaskUpdate`, the plugin injects a strong reminder for the assistant to check remaining tasks and run `/skill-analysis` if all tasks are done.
4. When you run `git commit`, the commit guard checks whether the audit has been run. If not, it blocks the commit and tells you to run `/skill-analysis` first.

### Manual

At any point during or after a session:

```
/skill-analysis
```

This triggers the two-stage analysis and prints the three-table report directly in the conversation.

### Output

The report is produced in the user's detected language and contains three tables:

- **Table 1** — Skills Used: skills that were actually used, with their purpose
- **Table 2** — Missed Skills: skills that should have been used, with evidence. Only listed when there is concrete, undeniable proof (90%+ confidence). An empty table is preferred over a speculative one.
- **Table 3** — MOC Flow: the Map of Content flow for the session, linking topics to relevant files

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

| Skill | Neden Gerekli? | Kanıt |
|---|---|---|
| /test-driven-development | Yeni hook fonksiyonları için birim testler yazılmadan önce kullanılmalıydı | hooks/skill-tracker-post.mjs yeni oluşturuldu, TDD trigger koşulu karşılandı |

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
│   ├── plugin.json               # Plugin manifest (name, version, hooks, skills)
│   └── marketplace.json          # Marketplace listing metadata
├── hooks/
│   ├── hooks.json                # Hook registration for the Claude Code harness
│   ├── skill-tracker-post.mjs    # PostToolUse: logs tool events to JSONL
│   ├── skill-audit-reminder.mjs  # PreToolUse: blocks git commit if audit not run
│   └── skill-analysis-session.mjs# SessionStart + PreCompact: injects reminders
├── skills/
│   └── skill-analysis/
│       └── SKILL.md              # /skill-analysis skill definition
├── tests/
│   ├── helpers.mjs               # Shared test utilities
│   ├── run-all.mjs               # Runs all suites (node tests/run-all.mjs)
│   ├── test-normal-flow.mjs      # Normal session flow tests
│   ├── test-commit-guard.mjs     # Commit guard tests
│   ├── test-subagent.mjs         # Subagent isolation tests
│   ├── test-edge-cases.mjs       # Edge case tests
│   └── test-kill-switch.mjs      # Kill switch (enable/disable) tests
├── version.txt                   # Current version
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

## Configuration

The plugin works out of the box with **zero configuration**. However, you can disable it per-project by adding the following to the project's `.claude/settings.json`:

```json
{
  "env": {
    "PERFORMANCE_ENABLED": "false"
  }
}
```

When disabled, all hooks become no-ops: no tracking, no commit guard, no context injection. Accepted disable values: `"false"` or `"0"`. To re-enable, set the value to `"true"` or remove the key entirely (default is enabled).

---

## Subagent Support

The plugin fully tracks tool usage from subagents (Agent tool, Task tool). When Claude spawns a subagent, each subagent runs with a different `session_id`. The plugin handles this correctly:

- The `session_start` marker is written **only once** at actual SessionStart — not on session_id changes
- `PostToolUse` hook fires for both parent and subagent tool calls, all logged to the same JSONL
- `/skill-analysis` sees the complete picture: parent + all subagent skills, edits, and tool counts

No configuration needed — subagent tracking works automatically.

---

## Runtime State Files

The plugin stores session state in the **project's** `.claude/hooks/state/` directory, not in the plugin root. This keeps state isolated per project and avoids polluting the plugin installation.

| File | Purpose |
|---|---|
| `skill-tracker.jsonl` | Append-only log of all tool-use events for the current session (parent + subagents) |
| `skill-audit-flag.json` | Written when the audit completes; read by the commit guard |

These files are created automatically on first use. You can safely delete them to reset the state for a session.

---

## Running Tests

The plugin includes a comprehensive test suite covering normal flows, subagent scenarios, commit guard, and edge cases (62 assertions across 4 suites).

**Run all tests:**
```bash
node tests/run-all.mjs
```

**Run a single suite:**
```bash
node tests/test-normal-flow.mjs
node tests/test-commit-guard.mjs
node tests/test-subagent.mjs
node tests/test-edge-cases.mjs
```

Test suites:
| Suite | Tests | What it covers |
|---|---|---|
| `test-normal-flow.mjs` | 8 | Session lifecycle, skill/edit/tool tracking, audit triggers |
| `test-commit-guard.mjs` | 5 | Block/allow behavior, cooldown, non-commit passthrough |
| `test-subagent.mjs` | 4 | Parent+subagent visibility, nested agents, stress test |
| `test-edge-cases.mjs` | 7 | Missing SessionStart, PreCompact isolation, empty sessions, auto-created state dir, missing inputs, timestamps |
| `test-kill-switch.mjs` | 7 | PERFORMANCE_ENABLED=false disables all hooks, default enabled, mid-session toggle |

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

### Non-ASCII characters appear garbled

Ensure your terminal and editor are set to UTF-8. The output may contain non-ASCII characters depending on the detected user language.
