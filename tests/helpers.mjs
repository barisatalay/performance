/**
 * Shared test helpers for all test files.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

export const ROOT = join(import.meta.dirname, '..');
export const STATE_DIR = join(ROOT, '.claude', 'hooks', 'state');
export const JSONL = join(STATE_DIR, 'skill-tracker.jsonl');
export const AUDIT_FLAG = join(STATE_DIR, 'skill-audit-flag.json');
export const SESSION_HOOK = join(ROOT, 'hooks', 'skill-analysis-session.mjs');
export const TRACKER_HOOK = join(ROOT, 'hooks', 'skill-tracker-post.mjs');
export const REMINDER_HOOK = join(ROOT, 'hooks', 'skill-audit-reminder.mjs');

let passed = 0;
let failed = 0;

export function cleanState() {
    [JSONL, AUDIT_FLAG, join(STATE_DIR, 'skill-tracker-session.txt')].forEach(f => {
        if (existsSync(f)) rmSync(f);
    });
}

export function run(script, input) {
    return execSync(`echo '${JSON.stringify(input)}' | node ${script}`, {
        cwd: ROOT,
        encoding: 'utf8',
    });
}

export function readJSONL() {
    if (!existsSync(JSONL)) return [];
    const content = readFileSync(JSONL, 'utf8').trim();
    if (!content) return [];
    return content.split('\n').map(l => JSON.parse(l));
}

export function countType(entries, type) {
    return entries.filter(e => e.type === type).length;
}

export function assert(name, condition) {
    if (condition) {
        console.log(`  ✅ ${name}`);
        passed++;
    } else {
        console.log(`  ❌ ${name}`);
        failed++;
    }
}

export function getResults() {
    return { passed, failed };
}

export function printResults() {
    console.log(`\n  Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        console.log('  ❌ SOME TESTS FAILED\n');
        process.exit(1);
    } else {
        console.log('  ✅ ALL TESTS PASSED\n');
        process.exit(0);
    }
}

export { readFileSync, writeFileSync, existsSync, rmSync };
