// Package only browser dependencies. Never upload the project directory itself.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.pages-dist');
const files = new Set();
const patterns = [
  /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:api[_-]?key|client[_-]?secret|password|access[_-]?token)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
];
function audit(name, text) {
  if (patterns.some(pattern => pattern.test(text))) {
    throw new Error(`Possible credential in ${name}; review before publishing (value withheld).`);
  }
}
if (process.argv.includes('--audit-tracked')) {
  const tracked = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
  for (const name of tracked) {
    assert(!/(?:^|\/)(?:\.env(?:\.|$)|credentials[^/]*|secrets[^/]*)|\.(?:pem|key|p12|pfx)$/i.test(name), `Sensitive filename: ${name}`);
    if (!name.endsWith('.woff2')) audit(name, fs.readFileSync(path.join(root, name), 'utf8'));
  }
  console.log(`Tracked credential scan: ${tracked.length} files checked (values withheld).`);
}
function include(reference, parent = 'index.html') {
  if (!reference || /^(?:data:|blob:|#)/i.test(reference)) return;
  assert(!/^(?:[a-z]+:|\/)/i.test(reference), `Non-relative asset: ${reference}`);
  const name = path.posix.normalize(path.posix.join(path.posix.dirname(parent), reference.split(/[?#]/)[0]));
  assert(!name.startsWith('..') && !name.includes('\\'), `Unsafe asset path: ${name}`);
  assert(/\.(?:html|css|js|woff2|png|svg|jpg|jpeg|webp|ico)$/.test(name), `Unexpected asset: ${name}`);
  if (files.has(name)) return;
  const source = path.join(root, name);
  assert(fs.statSync(source).isFile() && !fs.lstatSync(source).isSymbolicLink(), `Invalid asset: ${name}`);
  files.add(name);
  if (/\.(?:html|css|js|svg)$/.test(name)) {
    const text = fs.readFileSync(source, 'utf8');
    audit(name, text);
    if (name.endsWith('.html')) {
      for (const match of text.matchAll(/(?:src|href)\s*=\s*["']([^"']*)["']/gi)) include(match[1], name);
      assert(!/<base\b/i.test(text), 'Unexpected base URL; review subpath behavior.');
    }
    if (name.endsWith('.css')) {
      for (const match of text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi)) include(match[1], name);
      assert(!/@import\b/i.test(text), 'Review CSS imports before deploying.');
    }
  }
}
include('index.html');
// Font redistribution requires the accompanying license.
files.add('assets/fonts/pretendard/LICENSE.txt');
// Include .nojekyll even though the Actions deployment bypasses Jekyll.
assert(output === path.join(root, '.pages-dist'));
fs.rmSync(output, {recursive: true, force: true});
for (const name of files) {
  const target = path.join(output, name);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(path.join(root, name), target);
  assert(fs.readFileSync(target).equals(fs.readFileSync(path.join(root, name))), `Copy mismatch: ${name}`);
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log(`Pages package: ${files.size + 1} files; relative paths and credential patterns checked.`);
if (process.argv.includes('--list')) console.log([...files].sort().join('\n'));
