import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { transform } from 'esbuild';
import bytenode from 'bytenode';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
const configPath = path.join(projectRoot, 'obfuscator.config.json');
const distMainDir = path.join(projectRoot, 'dist', 'main');
const entryPath = path.join(distMainDir, 'main.mjs');
const obfuscatedEntryPath = path.join(distMainDir, 'main.obf.cjs');
const bytecodePath = path.join(distMainDir, 'main.jsc');

const ensurePaths = async () => {
  const configExists = await fs
    .access(configPath)
    .then(() => true)
    .catch(() => false);
  if (!configExists) {
    throw new Error('Missing obfuscator.config.json, aborting protection step.');
  }
  await fs.access(entryPath);
};

const createObfuscatedCjs = async () => {
  const configRaw = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(configRaw);
  const input = await fs.readFile(entryPath, 'utf8');
  const { code: cjsCode } = await transform(input, {
    format: 'cjs',
    loader: 'js',
    target: 'node20',
    sourcemap: false,
    minify: false
  });
  // Fix import.meta.dirname -> __dirname transformation issue
  // esbuild transforms import.meta.dirname to import_meta.dirname (which is undefined)
  // In CommonJS, __dirname is already available, so we remove the assignment
  // Pattern: const __dirname = import_meta.dirname; -> (removed, __dirname already exists)
  let fixedCjsCode = cjsCode.replace(/const\s+__dirname\s*=\s*import_meta\.dirname\s*;/g, '');
  // Also handle cases where it's used in other contexts (shouldn't happen, but just in case)
  fixedCjsCode = fixedCjsCode.replace(/import_meta\.dirname/g, '__dirname');
  const result = JavaScriptObfuscator.obfuscate(fixedCjsCode, config);
  await fs.writeFile(obfuscatedEntryPath, result.getObfuscatedCode(), 'utf8');
};

const compileBytecode = async () => {
  await fs.rm(bytecodePath, { force: true });
  await bytenode.compileFile({
    filename: obfuscatedEntryPath,
    output: bytecodePath,
    electron: true
  });
  await fs.rm(obfuscatedEntryPath, { force: true });
};

const writeLoader = async () => {
  const loaderSource = `import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import 'bytenode';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

require(path.join(__dirname, 'main.jsc'));
`;
  await fs.writeFile(entryPath, loaderSource, 'utf8');
  await fs.rm(path.join(distMainDir, 'main.mjs.map'), { force: true });
};

await ensurePaths();
await createObfuscatedCjs();
await compileBytecode();
await writeLoader();
console.log('✅ Protected Electron main process with obfuscation and bytecode.');

