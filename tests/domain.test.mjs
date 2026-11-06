import test from 'node:test';
import assert from 'node:assert/strict';
import {
  remainingTime,
  clockText,
  changeVote,
  countVotes,
  worldPoint,
  zoomAt,
} from '../src/domain.mjs';
test('shared timer counts elapsed time, pauses and never goes negative', () => {
  assert.equal(remainingTime({ remaining: 300, running: true, startedAt: 10000 }, 13000), 297);
  assert.equal(remainingTime({ remaining: 300, running: false, startedAt: 10000 }, 500000), 300);
  assert.equal(remainingTime({ remaining: 2, running: true, startedAt: 10000 }, 13000), 0);
  assert.equal(remainingTime({ remaining: 300, running: true, startedAt: 10000 }, 9000), 300);
  assert.equal(clockText(299.2), '05:00');
  assert.equal(clockText(0), '00:00');
  assert.equal(clockText(3661), '61:01');
});
test('vote budget, retraction and optional unique targets', () => {
  assert.deepEqual(changeVote(['a'], 'b', 1, 2, false), ['a', 'b']);
  assert.throws(() => changeVote(['a', 'b'], 'c', 1, 2, false), /used all/);
  assert.throws(() => changeVote(['a'], 'a', 1, 3, true), /one vote/);
  assert.deepEqual(changeVote(['a', 'b', 'a'], 'a', -1, 3, false), ['a', 'b']);
  assert.deepEqual(changeVote(['a'], 'b', -1, 3, false), ['a']);
  assert.deepEqual(countVotes([{ votes: ['a', 'b', 'a'] }, { votes: ['b', 'c'] }]), {
    a: 2,
    b: 2,
    c: 1,
  });
});
test('zoom preserves the point under the pointer and respects limits', () => {
  const rect = { left: 10, top: 20 },
    view = { x: 100, y: 80, zoom: 0.8 };
  const before = worldPoint(450, 270, rect, view);
  const next = zoomAt(view, 1.5, 440, 250);
  const after = worldPoint(450, 270, rect, next);
  assert.ok(Math.abs(before.x - after.x) < 1e-9);
  assert.ok(Math.abs(before.y - after.y) < 1e-9);
  assert.equal(zoomAt(view, 100, 0, 0).zoom, 2.5);
  assert.equal(zoomAt(view, 0.001, 0, 0).zoom, 0.15);
});
