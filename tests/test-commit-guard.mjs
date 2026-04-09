#!/usr/bin/env node

/**
 * Commit guard tests.
 * Tests: block/allow behavior, cooldown, non-commit passthrough.
 */

import {
    cleanState, run, assert, printResults,
    SESSION_HOOK, REMINDER_HOOK
} from './helpers.mjs';

console.log('═══════════════════════════════════════════════');
console.log('  Commit Guard Tests');
console.log('═══════════════════════════════════════════════');

// ── Test 1 ───────────────────────────────────────────────
console.log('\n📋 Test 1: Commit blocked before audit');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'block-sess' });

let output = run(REMINDER_HOOK, {
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m "test"' },
    session_id: 'block-sess'
});

let parsed = JSON.parse(output);
assert('Commit blocked', parsed.decision === 'block');
assert('Reason mentions skill audit', parsed.reason.includes('Skill audit'));

// ── Test 2 ───────────────────────────────────────────────
console.log('\n📋 Test 2: Commit allowed after first block (cooldown)');

// Continue from Test 1 — blockShownInSession is now true
output = run(REMINDER_HOOK, {
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m "retry"' },
    session_id: 'block-sess'
});

parsed = JSON.parse(output);
assert('Second commit allowed', parsed.decision === undefined);

// ── Test 3 ───────────────────────────────────────────────
console.log('\n📋 Test 3: Non-commit Bash commands pass through');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'pass-sess' });

const commands = ['npm test', 'ls -la', 'node build.js', 'echo hello'];
commands.forEach(cmd => {
    output = run(REMINDER_HOOK, {
        tool_name: 'Bash',
        tool_input: { command: cmd },
        session_id: 'pass-sess'
    });
    parsed = JSON.parse(output);
    assert(`"${cmd}" not blocked`, parsed.decision === undefined);
});

// ── Test 4 ───────────────────────────────────────────────
console.log('\n📋 Test 4: /commit skill also blocked');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'skillcommit-sess' });

output = run(REMINDER_HOOK, {
    tool_name: 'Skill',
    tool_input: { skill: 'commit' },
    session_id: 'skillcommit-sess'
});

parsed = JSON.parse(output);
assert('/commit skill blocked', parsed.decision === 'block');

// ── Test 5 ───────────────────────────────────────────────
console.log('\n📋 Test 5: Non-commit skills pass through');
cleanState();

run(SESSION_HOOK, { hook_event_name: 'SessionStart', session_id: 'otherskill-sess' });

const safeSkills = ['simplify', 'review-pr', 'skill-analysis'];
safeSkills.forEach(skill => {
    output = run(REMINDER_HOOK, {
        tool_name: 'Skill',
        tool_input: { skill },
        session_id: 'otherskill-sess'
    });
    parsed = JSON.parse(output);
    assert(`/${skill} not blocked`, parsed.decision === undefined);
});

// ── Done ─────────────────────────────────────────────────
cleanState();
printResults();
