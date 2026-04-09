#!/usr/bin/env node

/**
 * Normal session flow tests (no subagents).
 * Tests: session lifecycle, skill/edit/tool tracking, audit triggers.
 */

import {
    cleanState, run, readJSONL, countType, assert, printResults,
    SESSION_HOOK, TRACKER_HOOK, AUDIT_FLAG,
    writeFileSync, readFileSync
} from './helpers.mjs';

console.log('═══════════════════════════════════════════════');
console.log('  Normal Flow Tests');
console.log('═══════════════════════════════════════════════');

// ── Test 1 ───────────────────────────────────────────────
console.log('\n📋 Test 1: Normal session — SessionStart + tools + skill');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'normal-1' });
run(TRACKER_HOOK, { tool_name: 'Read', tool_input: { file_path: 'src/index.ts' }, session_id: 'normal-1' });
run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: { file_path: 'src/index.ts' }, session_id: 'normal-1' });
run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'commit' }, session_id: 'normal-1' });
run(TRACKER_HOOK, { tool_name: 'Bash', tool_input: { command: 'npm test' }, session_id: 'normal-1' });

let entries = readJSONL();
assert('1 session_start', countType(entries, 'session_start') === 1);
assert('1 skill (commit)', countType(entries, 'skill') === 1);
assert('1 edit (index.ts)', countType(entries, 'edit') === 1);
assert('4 tool entries (Read, Edit, Skill, Bash)', countType(entries, 'tool') === 4);

// ── Test 2 ───────────────────────────────────────────────
console.log('\n📋 Test 2: Multiple skills tracked correctly');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'skill-sess' });
run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'commit' }, session_id: 'skill-sess' });
run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'simplify' }, session_id: 'skill-sess' });
run(TRACKER_HOOK, { tool_name: 'Skill', tool_input: { skill: 'review-pr' }, session_id: 'skill-sess' });

entries = readJSONL();
const skills = entries.filter(e => e.type === 'skill').map(e => e.name);
assert('3 skills logged', skills.length === 3);
assert('commit tracked', skills.includes('commit'));
assert('simplify tracked', skills.includes('simplify'));
assert('review-pr tracked', skills.includes('review-pr'));

// ── Test 3 ───────────────────────────────────────────────
console.log('\n📋 Test 3: Edit and Write both tracked as edits');
cleanState();

run(TRACKER_HOOK, { tool_name: 'Edit', tool_input: { file_path: 'a.ts' }, session_id: 'edit-sess' });
run(TRACKER_HOOK, { tool_name: 'Write', tool_input: { file_path: 'b.ts' }, session_id: 'edit-sess' });
run(TRACKER_HOOK, { tool_name: 'Read', tool_input: { file_path: 'c.ts' }, session_id: 'edit-sess' });

entries = readJSONL();
const edits = entries.filter(e => e.type === 'edit').map(e => e.path);
assert('2 edits (Edit + Write)', edits.length === 2);
assert('a.ts tracked', edits.includes('a.ts'));
assert('b.ts tracked', edits.includes('b.ts'));
assert('Read is NOT tracked as edit', !edits.includes('c.ts'));

// ── Test 4 ───────────────────────────────────────────────
console.log('\n📋 Test 4: All tool types tracked in tool counts');
cleanState();

const toolNames = ['Read', 'Edit', 'Write', 'Bash', 'Skill', 'Glob', 'Grep', 'Agent', 'TaskCreate', 'WebSearch'];
toolNames.forEach(t => run(TRACKER_HOOK, { tool_name: t, tool_input: {}, session_id: 'count-sess' }));

entries = readJSONL();
const tracked = entries.filter(e => e.type === 'tool').map(e => e.name);
assert(`All ${toolNames.length} tool types tracked`, tracked.length === toolNames.length);
toolNames.forEach(t => assert(`  ${t} present`, tracked.includes(t)));

// ── Test 5 ───────────────────────────────────────────────
console.log('\n📋 Test 5: SessionStart resets audit flag');
cleanState();

writeFileSync(AUDIT_FLAG, JSON.stringify({ auditRanInSession: true, blockShownInSession: true }));
run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'reset-sess' });

const flag = JSON.parse(readFileSync(AUDIT_FLAG, 'utf8'));
assert('auditRanInSession reset to false', flag.auditRanInSession === false);

// ── Test 6 ───────────────────────────────────────────────
console.log('\n📋 Test 6: TaskUpdate(completed) triggers audit reminder');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'task-sess' });
let output = run(TRACKER_HOOK, {
    tool_name: 'TaskUpdate',
    tool_input: { status: 'completed' },
    session_id: 'task-sess'
});

let parsed = JSON.parse(output);
assert('Audit trigger injected', parsed.result === 'continue');
assert('Message contains SKILL AUDIT TRIGGER', parsed.message.includes('SKILL AUDIT TRIGGER'));

// ── Test 7 ───────────────────────────────────────────────
console.log('\n📋 Test 7: TaskUpdate(in_progress) does NOT trigger audit');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'nontrig-sess' });
output = run(TRACKER_HOOK, {
    tool_name: 'TaskUpdate',
    tool_input: { status: 'in_progress' },
    session_id: 'nontrig-sess'
});

parsed = JSON.parse(output);
assert('No audit trigger for in_progress', parsed.result === undefined);

// ── Test 8 ───────────────────────────────────────────────
console.log('\n📋 Test 8: Audit trigger fires only once per session');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'once-sess' });

const out1 = run(TRACKER_HOOK, {
    tool_name: 'TaskUpdate',
    tool_input: { status: 'completed' },
    session_id: 'once-sess'
});

writeFileSync(AUDIT_FLAG, JSON.stringify({ auditRanInSession: true }));

const out2 = run(TRACKER_HOOK, {
    tool_name: 'TaskUpdate',
    tool_input: { status: 'completed' },
    session_id: 'once-sess'
});

assert('First trigger fires', JSON.parse(out1).result === 'continue');
assert('Second trigger suppressed', JSON.parse(out2).result === undefined);

// ── Done ─────────────────────────────────────────────────
cleanState();
printResults();
