#!/usr/bin/env node

/**
 * skill-tracker-post.mjs — PostToolUse Hook
 *
 * Tracks skill invocations, file edits, and tool usage
 * in an append-only JSONL file.
 *
 * State: .claude/hooks/state/skill-tracker.jsonl (created at runtime)
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const STATE_DIR = join(process.cwd(), '.claude', 'hooks', 'state');
const JSONL_PATH = join(STATE_DIR, 'skill-tracker.jsonl');

try {
    if (!existsSync(STATE_DIR)) {
        mkdirSync(STATE_DIR, { recursive: true });
    }

    const input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
    const toolName = input.tool_name;
    const toolInput = input.tool_input || {};
    const ts = new Date().toISOString();

    // Track by tool type
    if (toolName === 'Skill') {
        const skillName = toolInput.skill || 'unknown';
        appendFileSync(JSONL_PATH, JSON.stringify({ type: 'skill', name: skillName, ts }) + '\n');
    } else if (toolName === 'Edit' || toolName === 'Write') {
        const filePath = toolInput.file_path || '';
        appendFileSync(JSONL_PATH, JSON.stringify({ type: 'edit', path: filePath, ts }) + '\n');
    }

    // Always log tool name for usage counts
    appendFileSync(JSONL_PATH, JSON.stringify({ type: 'tool', name: toolName, ts }) + '\n');

    // Auto-trigger: detect when all tasks are completed
    if (toolName === 'TaskUpdate' && toolInput.status === 'completed') {
        const auditFlagPath = join(STATE_DIR, 'skill-audit-flag.json');
        let auditAlreadyRan = false;
        try {
            if (existsSync(auditFlagPath)) {
                const flag = JSON.parse(readFileSync(auditFlagPath, 'utf8'));
                auditAlreadyRan = flag.auditRanInSession === true;
            }
        } catch (_) { /* ignore */ }

        if (!auditAlreadyRan) {
            const message = [
                '<system-reminder>',
                'SKILL AUDIT TRIGGER: A task was just marked as completed.',
                'Check if there are remaining pending/in_progress tasks using TaskList.',
                'If ALL tasks are done, you MUST invoke the skill-analysis skill NOW using:',
                'Skill tool with skill: "performance:skill-analysis"',
                'Do this BEFORE presenting the final summary to the user.',
                'This is a BLOCKING REQUIREMENT from the Skill Audit System.',
                '</system-reminder>'
            ].join('\n');
            console.log(JSON.stringify({ result: 'continue', message }));
            process.exit(0);
        }
    }

} catch (_) {
    // Hook must never fail
}

console.log(JSON.stringify({}));
