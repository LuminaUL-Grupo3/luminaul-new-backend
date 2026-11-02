const { existsSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { dirname, isAbsolute, relative, resolve, sep } = require("node:path");
const ts = require("typescript");

const root = resolve(__dirname, "..");
const sourceRoot = resolve(root, "src");
const outputRoot = resolve(root, "dist");

/** Recorre únicamente el JavaScript compilado, sin modificar fuentes ni dependencias. */
function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? javascriptFiles(path)
      : entry.name.endsWith(".js") ? [path] : [];
  });
}

/** Convierte las referencias locales generadas por Swagger en imports portables de dist. */
function normalize(file) {
  const code = readFileSync(file, "utf8");
  const syntax = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const replacements = [];

  function visit(node) {
    if (
      ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
      node.expression.text === "require" && node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      // El AST decodifica los escapes Unicode de las rutas con tildes en Windows.
      const argument = node.arguments[0];
      if (isAbsolute(argument.text)) {
        const source = relative(sourceRoot, argument.text);
        if (source && source !== ".." && !source.startsWith(".." + sep) && !isAbsolute(source)) {
          const target = resolve(outputRoot, source.replace(/\.(?:[cm]?ts|[cm]?js)$/, "") + ".js");
          if (!existsSync(target)) throw new Error(`Referencia compilada inexistente: ${target}`);
          const path = relative(dirname(file), target).split(sep).join("/");
          replacements.push({ start: argument.getStart(syntax), end: argument.end,
            value: JSON.stringify(path.startsWith(".") ? path : "./" + path) });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(syntax);
  // Aplicar de derecha a izquierda conserva las posiciones del resto del archivo.
  let result = code;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, replacement.start) + replacement.value + result.slice(replacement.end);
  }
  if (replacements.length) writeFileSync(file, result);
  return replacements.length;
}

const count = javascriptFiles(outputRoot).reduce((total, file) => total + normalize(file), 0);
console.log(`OpenAPI: ${count} referencias locales normalizadas en dist.`);
