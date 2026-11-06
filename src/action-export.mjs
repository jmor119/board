export function actionsCsv(actions) {
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [
    ['Action', 'Owner', 'Due', 'Status'],
    ...actions.map((a) => [a.text, a.owner, a.due, a.done ? 'Done' : 'Open']),
  ]
    .map((row) => row.map(cell).join(','))
    .join('\r\n');
}
