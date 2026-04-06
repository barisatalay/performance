#!/usr/bin/env node

/**
 * skill-analysis-session.mjs — SessionStart + PreCompact Hook
 *
 * Injects the skill-analysis trigger rule into Claude's context.
 * Registered for both SessionStart and PreCompact to survive context compaction.
 */

import { readFileSync } from 'fs';

try {
    // Read stdin (required by hook protocol)
    readFileSync('/dev/stdin', 'utf8');
} catch (_) {
    // Ignore stdin errors
}

const message = [
    '<system-reminder>',
    'Skill Audit System active. After completing any task (before commit, before PR, or when declaring work done),',
    'invoke /skill-analysis to audit skill usage for the current session.',
    '</system-reminder>'
].join('\n');

console.log(JSON.stringify({ result: 'continue', message }));
