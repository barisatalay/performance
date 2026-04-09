#!/usr/bin/env node

/**
 * Kill switch tests (PERFORMANCE_ENABLED=false).
 * Tests: all hooks become no-op when disabled, default is enabled.
 */

import {
    cleanState, run, readJSONL, countType, assert, printResults,
    SESSION_HOOK, TRACKER_HOOK, REMINDER_HOOK, AUDIT_FLAG, JSONL,
    existsSync
} from './helpers.mjs';

const DISABLED = { PERFORMANCE_ENABLED: 'false' };
const DISABLED_ZERO = { PERFORMANCE_ENABLED: '0' };
const ENABLED = { PERFORMANCE_ENABLED: 'true' };

console.log('═══════════════════════════════════════════════');
console.log('  Kill Switch Tests');
console.log('═══════════════════════════════════════════════');

// ── Test 1 ───────────────────────────────────────────────
console.log('\n📋 Test 1: Disabled — SessionStart does nothing');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'dis-1' }, DISABLED);

assert('No JSONL file created', !existsSync(JSONL));
assert('No audit flag created', !existsSync(AUDIT_FLAG));

// ── Test 2 ───────────────────────────────────────────────
console.log('\n📋 Test 2: Disabled — PostToolUse does not log');
cleanState();

run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'commit' }, session_id: 'dis-2' }, DISABLED);
run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: { file_path: 'a.ts' }, session_id: 'dis-2' }, DISABLED);

assert('No JSONL file created', !existsSync(JSONL));

// ── Test 3 ───────────────────────────────────────────────
console.log('\n📋 Test 3: Disabled — Commit guard does not block');
cleanState();

const output = run(REMINDER_HOOK, {
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m "test"' },
    session_id: 'dis-3'
}, DISABLED);

const parsed = JSON.parse(output);
assert('Commit not blocked when disabled', parsed.decision === undefined);

// ── Test 4 ───────────────────────────────────────────────
console.log('\n📋 Test 4: Disabled — TaskUpdate does not trigger audit');
cleanState();

const triggerOutput = run(TRACKER_HOOK, {
    tool_name: 'TaskUpdate',
    tool_input: { status: 'completed' },
    session_id: 'dis-4'
}, DISABLED);

const triggerParsed = JSON.parse(triggerOutput);
assert('No audit trigger when disabled', triggerParsed.result === undefined);

// ── Test 5 ───────────────────────────────────────────────
console.log('\n📋 Test 5: Explicitly enabled — works normally');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'en-5' }, ENABLED);
run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'commit' }, session_id: 'en-5' }, ENABLED);

const entries = readJSONL();
assert('session_start written', countType(entries, 'session_start') === 1);
assert('Skill logged', countType(entries, 'skill') === 1);

// ── Test 6 ───────────────────────────────────────────────
console.log('\n📋 Test 6: No env var set — defaults to enabled');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'def-6' });
run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: { file_path: 'x.ts' }, session_id: 'def-6' });

const defEntries = readJSONL();
assert('session_start written by default', countType(defEntries, 'session_start') === 1);
assert('Edit logged by default', countType(defEntries, 'edit') === 1);

// ── Test 7 ───────────────────────────────────────────────
console.log('\n📋 Test 7: Disabled with "0" — all hooks no-op');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'zero-7' }, DISABLED_ZERO);
run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'commit' }, session_id: 'zero-7' }, DISABLED_ZERO);

const zeroOutput = run(REMINDER_HOOK, {
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m "test"' },
    session_id: 'zero-7'
}, DISABLED_ZERO);

assert('No JSONL with "0"', !existsSync(JSONL));
assert('Commit not blocked with "0"', JSON.parse(zeroOutput).decision === undefined);

// ── Test 8 ───────────────────────────────────────────────
console.log('\n📋 Test 8: Disabled mid-session — stops logging');
cleanState();

// Start enabled
run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'mid-7' });
run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'commit' }, session_id: 'mid-7' });

// Now disable
run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'simplify' }, session_id: 'mid-7' }, DISABLED);

const midEntries = readJSONL();
assert('Only 1 skill logged (before disable)', countType(midEntries, 'skill') === 1);

// ── Done ─────────────────────────────────────────────────
cleanState();
printResults();
