# Comment and Documentation Guidelines

This document describes the conventions for comments, documentation, and test naming in the sprint-tracker codebase.

## Core Principles

1. **Comments explain intent, not mechanics** – avoid restating what the code already says
2. **TSDoc for public APIs** – exported functions, interfaces, and components should have proper TSDoc
3. **Concise and lowercase** – inline comments should be brief and all-lowercase
4. **Behavior-focused test names** – tests should describe what happens, not implementation details

## Inline Comments

### Style

- Use single-line `//` comments, not block comments (`/* */`)
- Write in all-lowercase
- Do not end with a full stop unless the comment spans multiple sentences
- Keep comments short and to the point

### When to Comment

**Good reasons to comment:**
- Non-obvious constraints or edge cases
- Business logic that isn't self-evident
- Workarounds for external limitations
- Complex algorithms that need context

**Bad reasons to comment:**
- Restating what the code already says
- Describing obvious operations
- Over-explaining simple logic

### Examples

**Good:**
```typescript
// ongoing sprints use "9999-12-31" for unbounded date range
const dates = await api.listHolidays(startDate, endDate ?? "9999-12-31");
```

**Bad:**
```typescript
// call the API to get the holidays
const dates = await api.listHolidays(startDate, endDate ?? "9999-12-31");
```

## TSDoc for Functions and Components

### When to Use TSDoc

- Exported functions and methods
- Public interfaces and types
- React components (especially with complex props)
- Internal functions with non-obvious behavior

**Do not add TSDoc to:**
- Trivial helpers where the name and signature are self-explanatory
- Private functions with obvious intent
- Simple getters/setters

### TSDoc Format

Always use multi-line format, even for short descriptions:

```typescript
/**
 * short description of what the function does
 * 
 * @param paramName description of the parameter
 * @param anotherParam description of another parameter
 * @returns description of return value
 */
export function exampleFunction(paramName: string, anotherParam: number): ReturnType {
```

### TSDoc Rules

- Start with a concise summary (one line if possible)
- Add a blank line after the summary if there are additional details
- Include `@param` for each parameter
- Include `@returns` only for non-void return values
- Keep descriptions concise but complete
- Write in lowercase for consistency with inline comments

### Examples

**Good:**
```typescript
/**
 * formats an ISO date string for display as dd/mm/yyyy
 * 
 * @param dateString ISO date string (YYYY-MM-DD)
 * @returns display date string (DD/MM/YYYY)
 */
export function formatDisplayDate(dateString: string): string {
    const [year, month, day] = dateString.split("-");
    return `${day}/${month}/${year}`;
}
```

**Good (component):**
```typescript
/**
 * colored pill displaying a subtask or story status
 * 
 * @param status the status to display
 * @param muted if true, renders with reduced opacity
 * @param onClick optional click handler
 */
export function StatusBadge({ status, muted, onClick }: StatusBadgeProps) {
```

## Interface and Type Documentation

For exported interfaces with non-obvious properties, use TSDoc:

```typescript
/**
 * one row of a subtask's transition history, sorted ascending
 * 
 * keeps full timestamp (not truncated to date) for precise duration math
 */
export interface TransitionRow {
    id: number;
    changedAt: string;
    status: SubtaskStatus;
    // days spent in the previous status before this transition
    daysInPrevious: number | null;
    // same duration as daysInPrevious, but exact milliseconds
    msInPrevious: number | null;
}
```

Use inline comments for properties when a TSDoc description would be redundant.

## Test Naming

### General Rules

- Use all-lowercase for `describe`, `it`, and `test` names
- Write behavior-focused descriptions ("does X", "shows Y", "creates Z")
- Avoid the word "should" where a direct verb phrase is clearer
- Keep test names concise but descriptive

### Preserve Casing for Named Entities

When referencing specific symbols, preserve their original casing:

- **HTTP methods**: `GET`, `POST`, `PATCH`, `DELETE`
- **Protocols/formats**: `JSON`, `URL`, `API`, `PDF`, `JIRA`
- **Variable/function names**: `sprintLock`, `localStorage`, `SubtaskRow`
- **Constants**: `DB_PATH`, `BASE_URL`

### Examples

**Good:**
```typescript
describe("export page", () => {
    it("lists all sprints", async () => {
        // ...
    });

    it("persists changes to localStorage", async () => {
        // ...
    });

    it("generates PDF with summary section", async () => {
        // ...
    });
});
```

**Good (preserving symbol casing):**
```typescript
describe("sprint detail page", () => {
    it("shows lock icon in title after sprint ends", async () => {
        // ...
    });

    it("refreshes from JIRA when key is present", async () => {
        // ...
    });
});
```

**Bad:**
```typescript
describe("ExportPage", () => {
    it("Should list every sprint", async () => {
        // ...
    });
});
```

### E2E Test Names

End-to-end tests can be slightly more descriptive to capture the full flow:

```typescript
describe("subtask full flow", () => {
    it("creates a subtask, transitions it through statuses, and exports history", async () => {
        // ...
    });
});
```

## Exceptions

### SQL Test Data

Long explanatory comments in `data/testing_data.sql` are acceptable and should not be shortened just to match code comment style. SQL data files benefit from verbose documentation.

## Migration Notes

This codebase has been cleaned up to follow these guidelines. When making changes:

- Follow these patterns for new code
- Update nearby comments/documentation to match when editing existing code
- Don't create noise by reformatting unrelated comments in the same PR

## Examples from the Codebase

For real-world examples of these guidelines in practice, see:

- `src/utils/subtaskTiming.ts` – TSDoc for functions and interfaces
- `src/components/StatusBadge.tsx` – TSDoc for React components
- `src/tests/integration/*.test.tsx` – test naming conventions
- `server/services/*.ts` – inline comments for business logic

