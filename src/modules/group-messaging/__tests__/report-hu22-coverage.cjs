const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/** Resumen por método derivado de Istanbul/V8, sin cambiar ni excluir código productivo. */
const directory = path.resolve(process.argv[2] || 'coverage/hu22');
const report = JSON.parse(fs.readFileSync(path.join(directory, 'coverage-final.json'), 'utf8'));
const selected = [
  ['groups.repository.ts', 'GroupsRepository.decide'],
  ['group-messaging.service.ts', 'GroupMessagingService.requests'],
  ['group-messaging.service.ts', 'GroupMessagingService.decide'],
];
function ratio(values) {
  const total = values.length;
  const covered = values.filter(n => n > 0).length;
  return { covered, total, pct: total ? Math.round(covered / total * 10000) / 100 : null };
}
const result = selected.map(([file, method]) => {
  const source = Object.entries(report).find(([key]) => key.replaceAll('\\', '/').endsWith('/' + file));
  if (!source) throw new Error('Archivo sin cobertura: ' + file);
  const [sourceFile, data] = source;
  const syntax = ts.createSourceFile(sourceFile, fs.readFileSync(sourceFile, 'utf8'), ts.ScriptTarget.Latest, true);
  const [className, methodName] = method.split('.');
  const declaration = syntax.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === className);
  const member = declaration?.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(syntax) === methodName);
  if (!member) throw new Error('Método no encontrado en el código fuente: ' + method);
  const firstLine = syntax.getLineAndCharacterOfPosition(member.getStart(syntax)).line + 1;
  const lastLine = syntax.getLineAndCharacterOfPosition(member.end).line + 1;
  const within = loc => loc?.start?.line >= firstLine && loc?.end?.line <= lastLine;
  const statements = Object.entries(data.statementMap).filter(([, loc]) => within(loc));
  const branches = Object.entries(data.branchMap).filter(([, branch]) => within(branch.loc));
  const lines = new Map();
  for (const [key, loc] of statements) lines.set(loc.start.line, Math.max(lines.get(loc.start.line) || 0, data.s[key]));
  return {
    method, sourceFile, firstLine, lastLine,
    statements: ratio(statements.map(([key]) => data.s[key])),
    branches: ratio(branches.flatMap(([key]) => data.b[key])),
    lines: ratio([...lines.values()]),
  };
});
fs.writeFileSync(path.join(directory, 'hu22-methods.json'), JSON.stringify(result, null, 2));
for (const row of result) {
  const branches = row.branches.total ? `${row.branches.covered}/${row.branches.total} (${row.branches.pct}%)` : 'sin decisiones instrumentadas';
  console.log(`${row.method}: ramas ${branches}; sentencias ${row.statements.covered}/${row.statements.total} (${row.statements.pct}%).`);
}
