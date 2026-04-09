#!/usr/bin/env node

/**
 * Subagent session isolation tests.
 * Tests: parent+subagent visibility, nested agents, stress test, audit trigger from subagent.
 */

import {
    cleanState, run, readJSONL, countType, assert, printResults,
    SESSION_HOOK, TRACKER_HOOK
} from './helpers.mjs';

console.log('═══════════════════════════════════════════════');
console.log('  Subagent Tests');
console.log('═══════════════════════════════════════════════');

// ── Test 1 ───────────────────────────────────────────────
console.log('\n📋 Test 1: Parent + subagent tools all visible');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'parent-1' });
run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'commit' }, session_id: 'parent-1' });
run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: { file_path: 'src/a.ts' }, session_id: 'parent-1' });
run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'simplify' }, session_id: 'subagent-1' });
run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: { file_path: 'src/b.ts' }, session_id: 'subagent-1' });
run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: { file_path: 'src/c.ts' }, session_id: 'parent-1' });

let entries = readJSONL();
assert('Single session_start', countType(entries, 'session_start') === 1);
assert('Both skills (parent + subagent)', countType(entries, 'skill') === 2);
assert('All 3 edits (parent + subagent)', countType(entries, 'edit') === 3);

// ── Test 2 ───────────────────────────────────────────────
console.log('\n📋 Test 2: Nested subagents (3 levels deep)');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'parent-2' });
run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'a' }, session_id: 'parent-2' });
run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'b' }, session_id: 'sub-level-1' });
run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'c' }, session_id: 'sub-level-2' });
run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: { file_path: 'deep.ts' }, session_id: 'sub-level-2' });

entries = readJSONL();
assert('Single session_start', countType(entries, 'session_start') === 1);
assert('All 3 skills from 3 levels', countType(entries, 'skill') === 3);

// ── Test 3 ───────────────────────────────────────────────
console.log('\n📋 Test 3: Subagent TaskUpdate triggers audit');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'parent-3' });

const output = run(TRACKER_HOOK, {
    tool_name: 'TaskUpdate',
    tool_input: { status: 'completed' },
    session_id: 'subagent-3'
});

assert('Audit trigger from subagent', JSON.parse(output).result === 'continue');

// ── Test 4 ───────────────────────────────────────────────
console.log('\n📋 Test 4: Stress — 10 subagents, each with skill + edit');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'stress-parent' });

for (let i = 0; i < 10; i++) {
    run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: `skill-${i}` }, session_id: `sub-${i}` });
    run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: { file_path: `file-${i}.ts` }, session_id: `sub-${i}` });
}

entries = readJSONL();
assert('Single session_start', countType(entries, 'session_start') === 1);
assert('All 10 skills', countType(entries, 'skill') === 10);
assert('All 10 edits', countType(entries, 'edit') === 10);

// ── Done ─────────────────────────────────────────────────
cleanState();
printResults();
