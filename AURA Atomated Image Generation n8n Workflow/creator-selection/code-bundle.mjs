import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../content creator website/package.json', import.meta.url));
const ts = require('typescript');
const strip = text => text.replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');

// Bundle only the locally authored helpers a Code node uses. No external modules
// other than n8n Cloud's crypto builtin are required at workflow runtime.
export function codeBundle(body, extraFiles = []) {
  const common = ts.transpileModule(readFileSync(new URL('../../content creator website/app/creator-selection.ts', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const sourceText = [common, ...['selection-core.mjs','traversal-core.mjs','routing-engine.mjs', ...extraFiles]
    .map(name => readFileSync(new URL(name, import.meta.url), 'utf8'))].map(strip).join('\n');
  const source = ts.createSourceFile('aura.js', sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const declarations = new Map();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) declarations.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement)) for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) declarations.set(decl.name.text, statement);
    }
  }
  const needed = new Set();
  function visit(node) {
    if (ts.isIdentifier(node) && declarations.has(node.text) && !needed.has(node.text)) {
      needed.add(node.text); visit(declarations.get(node.text));
    }
    ts.forEachChild(node, visit);
  }
  visit(ts.createSourceFile('body.js', body, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS));
  const statements = [...new Set([...needed].map(name => declarations.get(name)))];
  statements.sort((a, b) => a.pos - b.pos);
  return "const { createHash } = require('crypto');\n" + statements.map(statement => statement.getText(source)).join('\n') + '\n// AURA_NODE_BODY\n' + body;
}
