#!/usr/bin/env node

/**
 * Runs all test suites sequentially.
 * Usage: node tests/run-all.mjs
 */

import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const suites = [
    'tests/test-normal-flow.mjs',
    'tests/test-commit-guard.mjs',
    'tests/test-subagent.mjs',
    'tests/test-edge-cases.mjs',
    'tests/test-kill-switch.mjs',
];

let allPassed = true;

for (const suite of suites) {
    try {
        const output = execSync(`node ${suite}`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
        console.log(output);
    } catch (err) {
        console.log(err.stdout || '');
        console.error(err.stderr || '');
        allPassed = false;
    }
}

console.log('═══════════════════════════════════════════════');
if (allPassed) {
    console.log('  ✅ ALL SUITES PASSED');
} else {
    console.log('  ❌ SOME SUITES FAILED');
    process.exit(1);
}
console.log('═══════════════════════════════════════════════');
