export type Stage = { id: string; name: string; seconds: number };
export type Timer = {
  stage: number;
  running: boolean;
  remaining: number;
  startedAt: number;
  autoAdvance: boolean;
  display: 'both' | 'visual' | 'digital';
};
export type Board = {
  id: string;
  ownerId: string;
  title: string;
  teamId: string;
  invitedEmails: string[];
  publicEnabled: boolean;
  publicUntil: number;
  createdAt: number;
  updatedAt: number;
  agenda: Stage[];
  timer: Timer;
  currentRoundId: string;
  template: string;
};
export type BoardObject = {
  id: string;
  type: 'note' | 'text' | 'frame' | 'shape' | 'draw';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  locked: boolean;
  authorId: string;
  points: number[];
  strokeWidth: number;
  createdAt: number;
  updatedAt: number;
};
export type Presence = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  lastSeen: number;
};
export type Round = {
  id: string;
  title: string;
  budget: number;
  hidden: boolean;
  unique: boolean;
  state: 'open' | 'closed';
  targetIds: string[];
  createdAt: number;
};
export type Ballot = { id: string; votes: string[] };
export type Action = {
  id: string;
  text: string;
  owner: string;
  due: string;
  done: boolean;
  authorId: string;
  createdAt: number;
};
export type Team = {
  id: string;
  name: string;
  ownerId: string;
  memberEmails: string[];
  createdAt: number;
};
export type Template = {
  id: string;
  name: string;
  description?: string;
  ownerId?: string;
  objects: Partial<BoardObject>[];
};
