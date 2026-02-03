# Linting Setup and Guidelines

## Overview

This project uses strict linting rules to ensure clean, consistent, and maintainable code. Linting is enforced at multiple levels:

1. **ESLint** - TypeScript/JavaScript code quality
2. **Markdownlint** - Markdown documentation quality
3. **Git Pre-commit Hooks** - Automatic validation before commits
4. **CI/CD Integration** - Build-time validation

## ESLint Configuration

### Current Rules

The project uses strict ESLint rules configured in `eslint.config.js`:

- **TypeScript Rules**:
  - `no-unused-vars`: Warning for unused variables (off for interfaces/types)
  - `no-explicit-any`: Warning for explicit any types (off for test files)
  - Type safety checks enabled
  
- **React Rules**:
  - React Hooks rules enforced
  - Accessibility (a11y) warnings enabled
  - No PropTypes required (using TypeScript)

- **General Rules**:
  - `no-console`: Warning (allow warn/error)
  - `prefer-const`: Error
  - `no-var`: Error
  - `object-shorthand`: Off (intentionally verbose for clarity)

### Running ESLint

```bash
# Check for linting errors
npm run lint

# Auto-fix linting errors
npm run lint:fix

# Strict mode (fail on warnings)
npm run lint:strict
```

### File-Specific Rules

Different rules apply to different file types:

- **Test files** (`**/*.test.ts`, `**/*.test.tsx`): Relaxed `any` types
- **Type definitions** (`**/types/**/*.ts`, `**/*.d.ts`): No unused-vars checks
- **Config files** (`**/*.config.ts`): Relaxed TypeScript rules
- **Electron main** (`electron/**/*.ts`): Allow `require()` syntax

## Markdownlint Configuration

### Current Rules

Configured in `.markdownlint.json`:

- Enforce ATX-style headings (`#` prefix)
- Enforce consistent list styles
- Require blank lines around headings, lists, and code blocks
- Strong emphasis using asterisks (`**bold**` not `__bold__`)
- Relaxed rules for tables and code block languages

### Running Markdownlint

```bash
# Check markdown files
npm run lint:md

# Auto-fix markdown files
npm run lint:md:fix

# Check everything (code + markdown)
npm run lint:all

# Fix everything
npm run lint:all:fix
```

## Pre-Commit Hook Setup

### Option 1: Using Husky (Recommended)

Install Husky for automatic pre-commit linting:

```bash
# Install husky
npm install --save-dev husky

# Initialize husky
npx husky init

# Create pre-commit hook
npx husky add .husky/pre-commit "npm run lint:all"
```

### Option 2: Manual Git Hook

Create `.git/hooks/pre-commit`:

```bash
#!/bin/sh

echo "Running linters..."

# Run ESLint
npm run lint
ESLINT_EXIT=$?

# Run Markdownlint
npm run lint:md
MD_EXIT=$?

# Check exit codes
if [ $ESLINT_EXIT -ne 0 ] || [ $MD_EXIT -ne 0 ]; then
  echo "❌ Linting failed! Fix errors before committing."
  exit 1
fi

echo "✅ Linting passed!"
exit 0
```

Make it executable:

```bash
chmod +x .git/hooks/pre-commit
```

### Option 3: VS Code Integration

Install recommended extensions:

1. **ESLint** (dbaeumer.vscode-eslint)
2. **markdownlint** (DavidAnson.vscode-markdownlint)

Add to `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.fixAll.markdownlint": true
  },
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],
  "eslint.options": {
    "extensions": [".ts", ".tsx", ".js", ".jsx"]
  }
}
```

## Writing Clean Code

### TypeScript Guidelines

1. **Avoid `any` types** - Use proper types or `unknown`
2. **Use const by default** - Only use `let` when mutation is needed
3. **Remove unused imports** - Keep imports clean
4. **Explicit return types** - For public functions
5. **Interface over Type** - Prefer interfaces for object shapes

Example:

```typescript
// ❌ Bad
function getData(id: any) {
  var result = fetchData(id);
  return result;
}

// ✅ Good
function getData(id: string): Promise<UserData> {
  const result = fetchData(id);
  return result;
}
```

### React Guidelines

1. **Functional components** - Use hooks, not classes
2. **Accessibility** - Add aria-labels to icon buttons
3. **Hooks dependencies** - Keep useEffect deps complete
4. **Early returns** - Handle edge cases first

Example:

```tsx
// ❌ Bad
<button onClick={handleDelete}>
  <TrashIcon />
</button>

// ✅ Good
<button onClick={handleDelete} aria-label="Delete item">
  <TrashIcon />
</button>
```

### Markdown Guidelines

1. **Blank lines** - Around headings, lists, and code blocks
2. **Code blocks** - Specify language (with triple backticks and language name)
3. **Bold text** - Use `**bold**` not `__bold__`
4. **Consistent lists** - Use dashes for unordered lists

Example:

````markdown
❌ Bad:
## Heading
Some text without blank line above.
```
code without language
```

✅ Good:

## Heading

Some text with proper spacing.

```typescript
const code = 'with language specified';
```
````

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/lint.yml`:

```yaml
name: Lint

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run lint:all
```

### Pre-Push Validation

Add to `.git/hooks/pre-push`:

```bash
#!/bin/sh

echo "Running tests and linting before push..."

npm test && npm run lint:all

if [ $? -ne 0 ]; then
  echo "❌ Tests or linting failed! Fix errors before pushing."
  exit 1
fi

echo "✅ All checks passed!"
exit 0
```

## Troubleshooting

### Common Issues

**Issue: Too many linting errors in existing code**

Solution: Run auto-fix first, then address remaining issues:

```bash
npm run lint:all:fix
```

**Issue: ESLint cache causing false errors**

Solution: Clear ESLint cache:

```bash
rm -rf node_modules/.cache/eslint
npm run lint
```

**Issue: Markdownlint too strict**

Solution: Disable specific rules in `.markdownlint.json`:

```json
{
  "MD013": false,  // Line length
  "MD033": false   // Allow inline HTML
}
```

**Issue: VS Code not showing lint errors**

Solution:

1. Reload VS Code window (Ctrl+Shift+P → "Reload Window")
2. Check ESLint output panel for errors
3. Verify extensions are installed and enabled

### Getting Help

- **ESLint Rules**: https://eslint.org/docs/rules/
- **TypeScript ESLint**: https://typescript-eslint.io/rules/
- **Markdownlint Rules**: https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md
- **React ESLint**: https://github.com/jsx-eslint/eslint-plugin-react

## Best Practices

1. **Lint before committing** - Always run linters before git commit
2. **Fix at the source** - Write clean code from the start
3. **Use auto-fix** - Let tools fix formatting issues
4. **Review warnings** - Don't ignore warnings, they indicate potential issues
5. **Team consistency** - Everyone uses the same linting configuration

## Maintenance

### Updating Linting Rules

When adding or modifying linting rules:

1. **Document the change** - Update this guide
2. **Communicate to team** - Inform developers of new rules
3. **Provide examples** - Show before/after code samples
4. **Run auto-fix** - Clean up existing code if possible
5. **Test the change** - Ensure builds still pass

### Periodic Review

Schedule quarterly reviews of linting configuration:

- Remove obsolete rules
- Add new best practices
- Update dependencies
- Review false positives
- Gather team feedback

## Summary

Strict linting ensures:

- ✅ Consistent code style across the team
- ✅ Early detection of potential bugs
- ✅ Better code maintainability
- ✅ Improved code review efficiency
- ✅ Reduced technical debt

Run linters frequently, fix issues promptly, and maintain clean code from the start!
