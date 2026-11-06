export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function remainingTime(timer, now = Date.now()) {
  return Math.max(
    0,
    timer.remaining - (timer.running ? Math.max(0, now - timer.startedAt) / 1000 : 0),
  );
}
export function clockText(seconds) {
  const n = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(n / 60)
    .toString()
    .padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;
}
export function changeVote(votes, target, direction, budget, unique) {
  if (direction < 0) {
    const index = votes.lastIndexOf(target);
    return index < 0 ? votes : votes.filter((_, i) => i !== index);
  }
  if (votes.length >= budget)
    throw new Error('You have used all your votes. Remove one to vote elsewhere.');
  if (unique && votes.includes(target)) throw new Error('This round allows one vote per note.');
  return [...votes, target];
}
export function countVotes(ballots) {
  /** @type {Record<string, number>} */
  const totals = {};
  for (const ballot of ballots) for (const id of ballot.votes) totals[id] = (totals[id] || 0) + 1;
  return totals;
}
export function worldPoint(clientX, clientY, rect, view) {
  return {
    x: (clientX - rect.left - view.x) / view.zoom,
    y: (clientY - rect.top - view.y) / view.zoom,
  };
}
export function zoomAt(view, factor, x, y) {
  const zoom = clamp(view.zoom * factor, 0.15, 2.5);
  return {
    zoom,
    x: x - ((x - view.x) * zoom) / view.zoom,
    y: y - ((y - view.y) * zoom) / view.zoom,
  };
}
export const defaultAgenda = [
  { id: 'check-in', name: 'Check-in', seconds: 300 },
  { id: 'reflect', name: 'Reflect', seconds: 600 },
  { id: 'vote', name: 'Vote', seconds: 180 },
  { id: 'discuss', name: 'Discuss', seconds: 900 },
  { id: 'actions', name: 'Actions', seconds: 300 },
];
