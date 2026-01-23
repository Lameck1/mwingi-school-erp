# Coding Standards - MWINGI School ERP

## Overview

This document outlines the coding standards and best practices for the MWINGI School ERP project. These standards ensure code quality, maintainability, and consistency across the codebase.

## TypeScript Standards

### Type Safety

- **Always use specific types** instead of `any`. Define interfaces for all data structures.
- **Interface definitions** should be placed in the appropriate `types/` directory.
- **Avoid type assertions** (`as any`) unless absolutely necessary.
- **Use proper return types** for all functions, especially database queries and API handlers.

### Interface Naming

- Use PascalCase for interface names (e.g., `StudentData`, `FeeStructure`)
- Use descriptive names that clearly indicate the data structure's purpose
- Keep interfaces focused and single-purpose

## React Standards

### Component Structure

- **Keep components under 300 lines** - split into smaller components when necessary
- **Use functional components** with hooks (avoid class components)
- **Extract reusable logic** into custom hooks
- **Use proper TypeScript interfaces** for component props and state

### Hook Dependencies

- **Always include all dependencies** in useEffect dependency arrays
- **Use ESLint disable comments** (`// eslint-disable-next-line react-hooks/exhaustive-deps`) only when intentionally excluding dependencies
- **Document the reason** for excluding dependencies with inline comments

### State Management

- **Use Zustand** for global state management
- **Keep component state local** when it doesn't need to be shared
- **Use proper TypeScript interfaces** for store state and actions

## ESLint Configuration

### Current Rules

- `@typescript-eslint/no-explicit-any: warn` - Warns about `any` types
- `@typescript-eslint/no-unused-vars: error` - Enforces unused variable detection
- `react-hooks/exhaustive-deps: warn` - Warns about missing hook dependencies
- `no-console: warn` - Warns about console statements (allows warn/error)

### File-Specific Configurations

- **Interface files** (`types/**/*.ts`, `**/*.d.ts`): Unused vars disabled
- **Script files** (`scripts/**/*.cjs`, `scripts/**/*.js`): Console statements allowed
- **Test files** (`**/*.test.ts`, `**/*.test.tsx`): `any` types allowed
- **Configuration files** (`**/*.config.ts`): Project references disabled

## Code Organization

### Directory Structure

```text
src/
├── components/     # Reusable React components
├── pages/         # Page components (routes)
├── hooks/         # Custom React hooks
├── stores/        # Zustand stores
├── types/         # TypeScript type definitions
├── utils/         # Utility functions
└── contexts/      # React contexts
```

### File Naming

- **Components**: PascalCase (e.g., `StudentForm.tsx`, `Dashboard.tsx`)
- **Utilities**: camelCase (e.g., `formatCurrency.ts`, `validateEmail.ts`)
- **Types**: PascalCase with descriptive names (e.g., `StudentAPI.ts`, `FinanceTypes.ts`)

## Database Standards

### Database Type Safety

- **Always cast database results** to proper TypeScript interfaces
- **Use specific interfaces** for query parameters and results
- **Avoid `any` types** in database handlers

### Error Handling

- **Always handle errors** in async database operations
- **Use try-catch blocks** for all database queries
- **Log errors appropriately** using console.error or logging services

## Testing Standards

### Test Structure

- **Write tests for all new functionality**
- **Use descriptive test names** that explain what is being tested
- **Test edge cases** and error conditions
- **Mock external dependencies** appropriately

### Test Types

- **Unit tests** for individual functions and components
- **Integration tests** for API endpoints and database operations
- **End-to-end tests** for critical user workflows

## Performance Standards

### React Performance

- **Use React.memo** for expensive components that don't change frequently
- **Optimize re-renders** by using proper dependency arrays
- **Lazy load** heavy components when appropriate

### Database Performance

- **Use indexes** on frequently queried columns
- **Batch operations** when possible to reduce database calls
- **Cache frequently accessed data** when appropriate

## Security Standards

### Input Validation

- **Validate all user inputs** on both client and server sides
- **Sanitize database inputs** to prevent SQL injection
- **Use parameterized queries** for all database operations

### Authentication & Authorization

- **Implement proper authentication** for all protected routes
- **Use role-based access control** for different user types
- **Validate permissions** on both frontend and backend

## Code Review Checklist

Before submitting code for review, ensure:

1. **TypeScript compilation** passes without errors
2. **ESLint** passes without errors (warnings are acceptable for now)
3. **All tests** pass successfully
4. **No console.log statements** in production code (console.error is acceptable)
5. **Proper error handling** is implemented
6. **Code follows** the established patterns and conventions
7. **Documentation** is updated if necessary

## Common Issues and Solutions

### TypeScript Errors

- **"Unexpected any"**: Define proper interfaces for the data
- **"Missing dependencies"**: Add all required dependencies to useEffect arrays
- **"Unused variables"**: Remove unused variables or prefix with underscore for intentional unused vars

### React Hook Errors

- **"Missing dependencies"**: Include all dependencies or add eslint-disable comment with explanation
- **"Hook called conditionally"**: Ensure hooks are called in the same order every render

### ESLint Configuration Issues

- **Bundle files being linted**: Check global ignore patterns in eslint.config.js
- **Console statements**: Use console.warn or console.error instead of console.log

## Migration Path

For existing code that doesn't meet these standards:

1. **Prioritize critical errors** that affect functionality
2. **Fix TypeScript warnings** that improve type safety
3. **Address React Hook dependency issues** to prevent bugs
4. **Refactor gradually** - don't try to fix everything at once
5. **Test thoroughly** after making changes

## Tools and Resources

### Recommended Tools

- **TypeScript** for type safety
- **ESLint** for code quality
- **Prettier** for code formatting
- **Jest** for testing
- **React Developer Tools** for debugging

### Documentation

- **TypeScript Handbook**: <https://www.typescriptlang.org/docs/>
- **React Documentation**: <https://react.dev/>
- **ESLint Rules**: <https://eslint.org/docs/rules/>

## Continuous Improvement

These standards should be reviewed and updated regularly based on:

- **Team feedback** and lessons learned
- **New best practices** in the React/TypeScript ecosystem
- **Project requirements** and evolving needs
- **Performance metrics** and user feedback

Remember: These standards are guidelines to help write better code, not rigid rules. Use judgment and discuss with the team when exceptions are needed.
