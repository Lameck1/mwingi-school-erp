const fs = require('node:fs');
const path = require('node:path');

const lintPath = path.resolve('lint-after-fix.json');
if (!fs.existsSync(lintPath)) {
  console.error('Missing lint-after-fix.json');
  process.exit(1);
}

const lint = JSON.parse(fs.readFileSync(lintPath, 'utf8'));

const targetRules = new Set([
  'jsx-a11y/label-has-associated-control',
  'jsx-a11y/control-has-associated-label',
]);

const fileWarnings = new Map();
for (const fileResult of lint) {
  const relevant = fileResult.messages.filter((m) => m.severity === 1 && targetRules.has(m.ruleId));
  if (relevant.length > 0) {
    fileWarnings.set(fileResult.filePath, relevant);
  }
}

const tagRegex = /<(input|select|textarea|Input|Select)\b/;
const controlTagRegex = /<(button|select)\b/;

function extractAttr(line, attr) {
  const re = new RegExp(String.raw`${attr}\s*=\s*(["'])(.*?)\1`);
  const m = line.match(re);
  return m ? m[2] : null;
}

function addAttrToTagLine(line, tagName, attrName, attrValue) {
  const open = `<${tagName}`;
  const idx = line.indexOf(open);
  if (idx === -1) return line;
  const insertAt = idx + open.length;
  return `${line.slice(0, insertAt)} ${attrName}="${attrValue}"${line.slice(insertAt)}`;
}

let filesChanged = 0;
let fixes = 0;

for (const [absPath, warnings] of fileWarnings.entries()) {
  if (!absPath.endsWith('.tsx')) continue;
  if (!fs.existsSync(absPath)) continue;

  let content = fs.readFileSync(absPath, 'utf8');
  const lines = content.split(/\r?\n/);
  let changed = false;

  const sorted = [...warnings].sort((a, b) => b.line - a.line);

  for (const warning of sorted) {
    if (warning.ruleId === 'jsx-a11y/label-has-associated-control') {
      const lineIndex = warning.line - 1;
      let labelLineIndex = -1;
      for (let i = Math.max(0, lineIndex - 1); i <= Math.min(lines.length - 1, lineIndex + 1); i += 1) {
        if (lines[i].includes('<label')) {
          labelLineIndex = i;
          break;
        }
      }
      if (labelLineIndex === -1) continue;

      const labelLine = lines[labelLineIndex];
      if (labelLine.includes('htmlFor=')) continue;

      let controlLineIndex = -1;
      for (let i = labelLineIndex + 1; i <= Math.min(lines.length - 1, labelLineIndex + 14); i += 1) {
        if (tagRegex.test(lines[i])) {
          controlLineIndex = i;
          break;
        }
      }
      if (controlLineIndex === -1) continue;

      const controlLine = lines[controlLineIndex];
      const tagMatch = controlLine.match(tagRegex);
      if (!tagMatch) continue;
      const tagName = tagMatch[1];

      let controlId = extractAttr(controlLine, 'id');
      if (!controlId) {
        controlId = `field-${warning.line}`;
        lines[controlLineIndex] = addAttrToTagLine(controlLine, tagName, 'id', controlId);
        changed = true;
        fixes += 1;
      }

      if (!lines[labelLineIndex].includes('htmlFor=')) {
        lines[labelLineIndex] = addAttrToTagLine(lines[labelLineIndex], 'label', 'htmlFor', controlId);
        changed = true;
        fixes += 1;
      }
      continue;
    }

    if (warning.ruleId === 'jsx-a11y/control-has-associated-label') {
      const lineIndex = warning.line - 1;
      let controlLineIndex = -1;
      for (let i = Math.max(0, lineIndex - 1); i <= Math.min(lines.length - 1, lineIndex + 1); i += 1) {
        if (controlTagRegex.test(lines[i])) {
          controlLineIndex = i;
          break;
        }
      }
      if (controlLineIndex === -1) continue;

      const controlLine = lines[controlLineIndex];
      if (/(aria-label|aria-labelledby|title)=/.test(controlLine)) continue;

      const tagMatch = controlLine.match(controlTagRegex);
      if (!tagMatch) continue;
      const tagName = tagMatch[1];

      const placeholder = extractAttr(controlLine, 'placeholder');
      const name = extractAttr(controlLine, 'name');
      const id = extractAttr(controlLine, 'id');

      const labelValue = placeholder || name || id || (tagName === 'button' ? 'Action button' : 'Selection');
      lines[controlLineIndex] = addAttrToTagLine(controlLine, tagName, 'aria-label', labelValue);
      changed = true;
      fixes += 1;
    }
  }

  if (changed) {
    const next = lines.join('\n');
    if (next !== content) {
      fs.writeFileSync(absPath, next, 'utf8');
      filesChanged += 1;
    }
  }
}

console.log(`Files changed: ${filesChanged}`);
console.log(`Approx fixes applied: ${fixes}`);
