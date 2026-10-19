import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Execute the actual TS/TSX source with isolated dependencies and no build artifacts.
 * TypeScript is already a project dependency; tests require no network or database.
 */
export function loadSource(relativePath, { mocks = {}, globals = {} } = {}) {
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const sourceModule = { exports: {} };
    cache.set(filename, sourceModule);
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const nativeRequire = createRequire(filename);
    function requireModule(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith('@/') || specifier.startsWith('.')) {
        const base = specifier.startsWith('@/') ? path.join(root, 'src', specifier.slice(2))
          : path.resolve(path.dirname(filename), specifier);
        const resolved = ['.ts', '.tsx', '/index.ts', '/index.tsx'].map((suffix) => base + suffix).find(existsSync);
        if (resolved) return load(resolved);
      }
      return nativeRequire(specifier);
    }
    const run = new Function('require', 'module', 'exports', ...Object.keys(globals), compiled);
    run(requireModule, sourceModule, sourceModule.exports, ...Object.values(globals));
    return sourceModule.exports;
  }
  return load(path.join(root, relativePath));
}

/** A chainable query double. The callback receives the actual outgoing operations. */
export function queryClient(answer) {
  const calls = [];
  function query(table, args) {
    const operations = [];
    const entry = { table, args, operations };
    calls.push(entry);
    let result;
    const execute = () => result ??= Promise.resolve().then(() => answer(entry));
    const builder = {
      then: (resolve, reject) => execute().then(resolve, reject),
      maybeSingle: () => execute(),
      single: () => execute(),
    };
    for (const method of ['select', 'update', 'insert', 'eq', 'neq', 'is', 'not', 'or', 'in', 'order', 'range', 'abortSignal']) {
      builder[method] = (...values) => { operations.push([method, ...values]); return builder; };
    }
    return builder;
  }
  return { calls, client: { from: (table) => query(table), rpc: (table, args) => query(table, args) } };
}
