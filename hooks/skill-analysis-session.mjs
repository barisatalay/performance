#!/usr/bin/env node

/**
 * skill-analysis-session.mjs — SessionStart + PreCompact Hook
 *
 * Injects the skill-analysis trigger rule into Claude's context.
 * Registered for both SessionStart and PreCompact to survive context compaction.
 * On SessionStart, resets the audit flag so skill-analysis can run once per session.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Kill switch: set PERFORMANCE_ENABLED=false in .claude/settings.json env to disable
if (process.env.PERFORMANCE_ENABLED === 'false' || process.env.PERFORMANCE_ENABLED === '0') {
    console.log(JSON.stringify({}));
    process.exit(0);
}

let hookEvent = '';
try {
    const raw = readFileSync('/dev/stdin', 'utf8');
    const input = JSON.parse(raw);
    hookEvent = input.hook_event_name || input.hook_event || input.event || '';
} catch (_) {
    // Ignore stdin errors
}

// Reset audit flag and write session_start marker on SessionStart
if (hookEvent === 'SessionStart') {
    try {
        const stateDir = join(process.cwd(), '.claude', 'hooks', 'state');
        if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
        writeFileSync(join(stateDir, 'skill-audit-flag.json'), JSON.stringify({ auditRanInSession: false }));

        // Write session_start marker to JSONL — this is the ONLY place it gets written
        // so subagent session_id changes won't create spurious markers
        const jsonlPath = join(stateDir, 'skill-tracker.jsonl');
        appendFileSync(jsonlPath, JSON.stringify({ type: 'session_start', sessionId: 'main', ts: new Date().toISOString() }) + '\n');
    } catch (_) { /* ignore */ }
}

const isSessionStart = hookEvent === 'SessionStart';

const message = [
    '<system-reminder>',
    'Skill Audit System active. After completing any task (before commit, before PR, or when declaring work done),',
    'invoke /skill-analysis to audit skill usage for the current session.',
    isSessionStart
        ? 'IMPORTANT: Briefly inform the user that the performance plugin is active for this session. One short sentence, no details. Wrap the message with 🚨🚨 on both sides.'
        : '',
    '</system-reminder>'
].filter(Boolean).join('\n');

console.log(JSON.stringify({
    hookSpecificOutput: {
        hookEventName: hookEvent || 'SessionStart',
        additionalContext: message,
    },
}));
