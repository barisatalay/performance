#!/usr/bin/env node

/**
 * Edge case tests.
 * Tests: missing SessionStart, PreCompact isolation, empty sessions,
 *        auto-created state dir, missing inputs, timestamps.
 */

import {
    cleanState, run, readJSONL, countType, assert, printResults,
    SESSION_HOOK, TRACKER_HOOK, AUDIT_FLAG, STATE_DIR, JSONL,
    writeFileSync, existsSync, rmSync
} from './helpers.mjs';
import { readFileSync } from 'fs';

console.log('═══════════════════════════════════════════════');
console.log('  Edge Case Tests');
console.log('═══════════════════════════════════════════════');

// ── Test 1 ───────────────────────────────────────────────
console.log('\n📋 Test 1: PostToolUse fires before SessionStart');
cleanState();

run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'early' }, session_id: 'orphan' });
run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: { file_path: 'orphan.ts' }, session_id: 'orphan' });

let entries = readJSONL();
assert('No session_start marker', countType(entries, 'session_start') === 0);
assert('Entries still logged', entries.length > 0);
assert('Skill logged without session_start', countType(entries, 'skill') === 1);

// ── Test 2 ───────────────────────────────────────────────
console.log('\n📋 Test 2: PreCompact does NOT write session_start');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'compact-sess' });
run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: { file_path: 'before.ts' }, session_id: 'compact-sess' });
run(SESSION_HOOK, { hook_event_name: 'PreCompact', session_id: 'compact-sess' });
run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: { file_path: 'after.ts' }, session_id: 'compact-sess' });

entries = readJSONL();
assert('Still 1 session_start (PreCompact added none)', countType(entries, 'session_start') === 1);
assert('Both edits visible', countType(entries, 'edit') === 2);

// ── Test 3 ───────────────────────────────────────────────
console.log('\n📋 Test 3: PreCompact does NOT reset audit flag');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'flagkeep-sess' });
writeFileSync(AUDIT_FLAG, JSON.stringify({ auditRanInSession: true }));

run(SESSION_HOOK, { hook_event_name: 'PreCompact', session_id: 'flagkeep-sess' });

const flag = JSON.parse(readFileSync(AUDIT_FLAG, 'utf8'));
assert('auditRanInSession still true after PreCompact', flag.auditRanInSession === true);

// ── Test 4 ───────────────────────────────────────────────
console.log('\n📋 Test 4: SessionStart with zero tool calls');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'empty-sess' });

entries = readJSONL();
assert('Only 1 entry (session_start)', entries.length === 1);
assert('Entry type is session_start', entries[0].type === 'session_start');

// ── Test 5 ───────────────────────────────────────────────
console.log('\n📋 Test 5: State directory created if missing');

if (existsSync(STATE_DIR)) rmSync(STATE_DIR, { recursive: true });

run(TRACKER_HOOK, { tool_name: 'Bash', tool_input: { command: 'ls' }, session_id: 'newdir-sess' });

assert('State directory created', existsSync(STATE_DIR));
assert('JSONL file created', existsSync(JSONL));

// ── Test 6 ───────────────────────────────────────────────
console.log('\n📋 Test 6: Missing or empty tool_input');
cleanState();

run(TRACKER_HOOK, { tool_name: 'Skill', session_id: 's' });
run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: {}, session_id: 's' });

entries = readJSONL();
const skill = entries.find(e => e.type === 'skill');
const edit = entries.find(e => e.type === 'edit');
assert('Skill with missing input logged as "unknown"', skill && skill.name === 'unknown');
assert('Edit with empty path logged as ""', edit && edit.path === '');

// ── Test 7 ───────────────────────────────────────────────
console.log('\n📋 Test 7: All entries have valid timestamps');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'ts-sess' });
run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: { file_path: 'ts.ts' }, session_id: 'ts-sess' });

entries = readJSONL();
const allHaveTs = entries.every(e => e.ts && !isNaN(Date.parse(e.ts)));
assert('All entries have valid ISO timestamps', allHaveTs);

// ── Done ─────────────────────────────────────────────────
cleanState();
printResults();
