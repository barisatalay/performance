#!/usr/bin/env node

/**
 * skill-audit-reminder.mjs — PreToolUse Hook
 *
 * Detects commit attempts. If skill-analysis audit hasn't run yet,
 * blocks the commit and instructs Claude to run /skill-analysis first.
 * Max 1 block per session (cooldown after audit or first block).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Kill switch: set PERFORMANCE_ENABLED=false in .claude/settings.json env to disable
if (process.env.PERFORMANCE_ENABLED === 'false' || process.env.PERFORMANCE_ENABLED === '0') {
    console.log(JSON.stringify({}));
    process.exit(0);
}

const STATE_DIR = join(process.cwd(), '.claude', 'hooks', 'state');
const FLAG_PATH = join(STATE_DIR, 'skill-audit-flag.json');

try {
    const input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
    const toolName = input.tool_name;
    const toolInput = input.tool_input || {};
    const sessionId = input.session_id || input.generation_id || 'unknown';

    // Fast path: only care about commit actions
    if (!isCommitAction(toolName, toolInput)) {
        process.stdout.write(JSON.stringify({}));
        process.exit(0);
    }

    // Commit detected — check audit state
    if (!existsSync(STATE_DIR)) {
        mkdirSync(STATE_DIR, { recursive: true });
    }

    let flag = { sessionId: '', auditRanInSession: false, blockShownInSession: false };

    try {
        if (existsSync(FLAG_PATH)) {
            flag = JSON.parse(readFileSync(FLAG_PATH, 'utf8'));
        }
    } catch (_) {
        // Use defaults
    }

    // Reset on new session
    if (flag.sessionId !== sessionId) {
        flag = { sessionId, auditRanInSession: false, blockShownInSession: false };
    }

    // Audit already ran OR block already shown → allow commit
    if (flag.auditRanInSession || flag.blockShownInSession) {
        process.stdout.write(JSON.stringify({}));
        process.exit(0);
    }

    // Block commit once, then allow subsequent attempts
    flag.blockShownInSession = true;
    writeFileSync(FLAG_PATH, JSON.stringify(flag, null, 2));

    process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: 'Skill audit has not been run yet. Run /skill-analysis now, then retry this commit.'
    }));

} catch (_) {
    // Hook must never fail
    process.stdout.write(JSON.stringify({}));
}

function isCommitAction(toolName, toolInput) {
    if (toolName === 'Bash') {
        const cmd = toolInput.command || '';
        return /git\s+commit/.test(cmd);
    }
    if (toolName === 'Skill') {
        const skill = toolInput.skill || '';
        return /^commit$/i.test(skill);
    }
    return false;
}
