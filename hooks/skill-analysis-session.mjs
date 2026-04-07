#!/usr/bin/env node

/**
 * skill-analysis-session.mjs — SessionStart + PreCompact Hook
 *
 * Injects the skill-analysis trigger rule into Claude's context.
 * Registered for both SessionStart and PreCompact to survive context compaction.
 * On SessionStart, resets the audit flag so skill-analysis can run once per session.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

let hookEvent = '';
try {
    const raw = readFileSync('/dev/stdin', 'utf8');
    const input = JSON.parse(raw);
    hookEvent = input.hook_event || input.event || '';
} catch (_) {
    // Ignore stdin errors
}

// Reset audit flag on SessionStart so it can trigger once per session
if (hookEvent === 'SessionStart') {
    try {
        const stateDir = join(process.cwd(), '.claude', 'hooks', 'state');
        if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
        writeFileSync(join(stateDir, 'skill-audit-flag.json'), JSON.stringify({ auditRanInSession: false }));
    } catch (_) { /* ignore */ }
}

const message = [
    '<system-reminder>',
    'Skill Audit System active. After completing any task (before commit, before PR, or when declaring work done),',
    'invoke /skill-analysis to audit skill usage for the current session.',
    '</system-reminder>'
].join('\n');

console.log(JSON.stringify({ result: 'continue', message }));
