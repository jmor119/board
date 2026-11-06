import type { Template } from './types';
const frames = (titles: string[], colors: string[]) =>
  titles.map((text, i) => ({
    type: 'frame' as const,
    x: 90 + i * 410,
    y: 110,
    w: 380,
    h: 670,
    text,
    color: colors[i],
    locked: true,
  }));
export const builtins: Template[] = [
  {
    id: 'start-stop-continue',
    name: 'Start, stop, continue',
    description: 'Small changes. Better ways of working.',
    objects: frames(['Start doing', 'Stop doing', 'Keep doing'], ['#e4ecd5', '#f5ded7', '#dce7f0']),
  },
  {
    id: 'went-well',
    name: 'The good, the tricky, the next',
    description: 'Celebrate the wins. Make room for what’s next.',
    objects: frames(
      ['What went well?', 'What was tricky?', 'What will we try?'],
      ['#e4ecd5', '#f5e8c4', '#e4def1'],
    ),
  },
  {
    id: 'four-ls',
    name: 'The four Ls',
    description: 'Liked, learned, lacked, longed for.',
    objects: frames(
      ['Liked', 'Learned', 'Lacked', 'Longed for'],
      ['#e4ecd5', '#dce7f0', '#f5ded7', '#f5e8c4'],
    ),
  },
  {
    id: 'blank',
    name: 'A clean slate',
    description: 'A little space for your next big idea.',
    objects: [],
  },
];
export const noteColors = ['#fae9a4', '#cfe9bf', '#cddff2', '#f4c9bf', '#ded0ef', '#ffffff'];
export const cursorColors = ['#34694e', '#b85c3b', '#526db4', '#9e4e84', '#ad8225', '#5d8491'];
