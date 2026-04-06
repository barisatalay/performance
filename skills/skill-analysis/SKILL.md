---
name: skill-analysis
description: Analyzes skill usage after task completion. Reads session tracking data, compares against the full skill catalog, and produces a 3-table audit report showing used skills, missed skills, and MOC flow. Triggered automatically when a task is complete, or manually via /skill-analysis.
user-invokable: true
---

When this skill is invoked, follow these steps exactly:

## Step 1: Read Session Data

Read `.claude/hooks/state/skill-tracker.jsonl`.

Parse all lines as JSONL. Filter to ONLY entries that appear after the last line where `type == "session_start"`. If no `session_start` exists, use all entries.

If the file is missing or empty, report:
> "No tracking data found for this session"

Then stop — do not proceed to further steps.

From the filtered entries, extract:
- `usedSkills[]` — collect `name` field from every entry where `type == "skill"`
- `editedFiles[]` — collect `path` field from every entry where `type == "edit"`
- `toolCounts{}` — aggregate counts keyed by `tool` field from every entry where `type == "tool"`

## Step 2: Build Skill Catalog

Use the following fallback chain to build the full skill catalog:

1. If `.claude/skills/_index.md` exists → read it. It contains the full skill name, description, and trigger conditions for all skills.
2. Otherwise → glob `.claude/skills/*/SKILL.md`, read only the first 10 lines of each file to extract `name` and `description` from the YAML frontmatter.

## Step 3: Check MOC Files

Glob `.claude/skills/_moc-*.md`.

- If matches are found → read them. They contain skill-to-category mappings used for Table 3.
- If no matches are found → Table 3 will output: `"MOC dosyasi bulunamadi — atlandi"`

## Step 4: Pre-filter Catalog (Stage 1 — main model)

Read the edited files collected in Step 1 to understand what code was written during the session.

Filter the full skill catalog from Step 2 down to approximately 5–10 skills that are most relevant to this session. Base your filtering on:
- File path patterns (e.g., hook files, config files, skill files)
- Actual content of the edited files
- Tool usage patterns from `toolCounts{}`
- Each skill's description and trigger conditions

No configuration is needed — use semantic understanding to select the most relevant skills.

## Step 5: Fork Haiku Agent (Stage 2)

Launch an Agent with `model: haiku`.

Provide this exact prompt, substituting the placeholders with actual data from the previous steps:

---

```
You are a skill usage auditor for a Claude Code session.

## Session Data
- Skills invoked: {usedSkills from Step 1}
- Files edited: {editedFiles from Step 1}
- Tool usage counts: {toolCounts from Step 1}

## Relevant Skills (pre-filtered)
{~5-10 skills from Step 4, each with full name + description + trigger conditions}

## MOC Map (if available)
{content from Step 3, or "Not available"}

## Task
Produce exactly 3 markdown tables in Turkish:

### Tablo 1: Kullanilan Skill'ler
| Skill | Kullanim Amaci |
For each skill in the session data, describe what it was likely used for
based on the edited files context.

### Tablo 2: Kacirilan Skill'ler
| Skill | Neden Gerekli? |
Compare the pre-filtered relevant skills against the invoked skills list.
For each relevant skill that was NOT invoked, explain why it should have been
based on the file paths and trigger conditions.
Only list skills with clear evidence. Do not speculate.

### Tablo 3: MOC Akisi
| MOC | Ilgili Dosyalar |
Map edited files to their MOC categories.
If MOC data is not available, output: "MOC dosyasi bulunamadi — atlandi"

Output ONLY the 3 tables. No preamble, no explanation.
Write table content in Turkish.
```

---

## Step 6: Display Output and Cleanup

1. Show the Haiku agent's response directly to the user.

2. Update `.claude/hooks/state/skill-audit-flag.json`:
   - Read the existing file if it exists, or start with a default empty object `{}`
   - Set `auditRanInSession` to `true`
   - Write the updated object back to the file

3. Truncate `.claude/hooks/state/skill-tracker.jsonl` by writing an empty string to it.
   - Wrap this write in a try/catch block.
   - If truncation fails, that is acceptable — the next session's `session_start` marker will handle data isolation automatically.
