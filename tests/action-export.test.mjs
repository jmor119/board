import test from 'node:test';
import assert from 'node:assert/strict';
import { actionsCsv } from '../src/action-export.mjs';
test('action exports preserve quotes and lines, and neutralise spreadsheet formulas', () => {
  const csv = actionsCsv([
    { text: '=SUM(1,2)', owner: 'A "name"', due: '2026-11-07', done: false },
    { text: 'Two\nlines', owner: '', due: '', done: true },
  ]);
  assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.ok(csv.includes('"A ""name"""'));
  assert.ok(csv.includes('"Two\nlines"'));
  assert.ok(csv.includes('"Done"'));
});
