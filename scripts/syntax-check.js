var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

var root = path.resolve(__dirname, '..');
var ignored = ['node_modules', '.git', 'public/vendor'];

function isIgnored(relativePath) {
  return ignored.some(function (prefix) {
    return relativePath === prefix || relativePath.indexOf(prefix + path.sep) === 0;
  });
}

function collect(dir, files) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    var full = path.join(dir, entry.name);
    var relative = path.relative(root, full);
    if (isIgnored(relative)) return;
    if (entry.isDirectory()) return collect(full, files);
    if (entry.isFile() && path.extname(entry.name) === '.js') files.push(full);
  });
}

var files = [];
collect(root, files);
var failed = [];

files.forEach(function (file) {
  var result = childProcess.spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed.push({ file: path.relative(root, file), output: (result.stderr || result.stdout || '').trim() });
  }
});

if (failed.length) {
  failed.forEach(function (item) {
    console.error('\n' + item.file + '\n' + item.output);
  });
  process.exit(1);
}

console.log('JavaScript syntax check passed for ' + files.length + ' files.');
