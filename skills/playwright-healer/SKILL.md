---
name: playwright-healer
description: >
  Heal failing Playwright tests by diagnosing failures via browser snapshots,
  LSP definition/reference lookup, and applying selector fixes across POM files.
  Use when a Playwright test fails with TimeoutError, selector not found,
  or element not visible. Supports cross-origin iframes via run-code.
allowed-tools: playwright-healer_execute_cli,playwright-healer_resolve_definition,playwright-healer_find_references,playwright-healer_get_type_info,playwright-healer_apply_edit
---

# Playwright Healer

## When to Use
- A Playwright test fails with TimeoutError or selector not found
- An element is no longer visible or has changed selector
- A page requires credentials or is still loading
- An iframe structure has changed

## Healing Flow

1. **Observe** — capture current page state:
   - `execute_cli` with command `snapshot` — get element tree with refs (e1, e2, ...)
   - `execute_cli` with command `screenshot` — get visual state

2. **Classify** — analyze error + snapshot to determine category:
   - `selector_mismatch` — element exists on page but selector is wrong
   - `environment_issue` — page still loading or transient error
   - `needs_credentials` — login form visible, requires user input
   - `feature_gone` — target element/feature no longer exists on page

3. **Act** based on classification:

   ### selector_mismatch
   - Find the correct element in snapshot by semantic match
   - Same-origin element: `execute_cli` with command `click <ref>` to verify
   - Cross-origin iframe: `execute_cli` with command `run-code "async page => { ... }"` to verify
   - `resolve_definition` — find where the broken selector is defined (POM file)
   - `find_references` — find every file that uses this selector
   - `apply_edit` — fix the selector in all locations
   - `execute_cli` with command `snapshot` — verify the fix

   ### environment_issue
   - Wait, then `execute_cli` with command `snapshot` to check if page is ready
   - Retry observation

   ### needs_credentials
   - Inform the user that credentials are required
   - List the credential fields found on the page

   ### feature_gone
   - Report that the element no longer exists
   - No automated fix possible — manual review needed

4. **Verify** — re-run snapshot to confirm the fix worked

## Semantic Equivalence Rule
When proposing a selector fix, you MUST verify a semantic link between the
failed selector and the replacement:
- Shared/similar class or ID names
- Matching visible text or ARIA labels
- Matching test-IDs
- Matching element role evident from the selector name

If the failed selector is opaque (e.g. `.wrong-selector`, `.xyz`) and no
element on the page shares a semantic relationship, classify as `feature_gone`.
Do NOT guess what the test "probably wanted".

## playwright-cli Commands

### Page Navigation
```
execute_cli with command "open https://example.com"
execute_cli with command "close"
```

### Observation
```
execute_cli with command "snapshot"
execute_cli with command "screenshot"
execute_cli with command "screenshot e5"
```

### Interaction (by element ref from snapshot)
```
execute_cli with command "click e3"
execute_cli with command "fill e5 \"user@example.com\""
execute_cli with command "hover e4"
execute_cli with command "select e9 \"option-value\""
execute_cli with command "check e12"
execute_cli with command "uncheck e12"
execute_cli with command "type \"search query\""
```

### Evaluation
```
execute_cli with command "eval \"document.title\""
execute_cli with command "eval \"el => el.textContent\" e5"
```

### Advanced — run-code (full Playwright API)
Use `run-code` when:
- Element is in a cross-origin iframe (`click <ref>` won't work)
- You need to chain multiple actions atomically
- You need to return values from the page

```
execute_cli with command "run-code \"async page => {
  const frames = page.frames();
  return frames.map(f => ({ name: f.name(), url: f.url() }));
}\""
```

```
execute_cli with command "run-code \"async page => {
  await page.frameLocator('iframe[name=\\\"AppFrame\\\"]')
    .locator('#submit-btn').click();
}\""
```

### Dialogs
```
execute_cli with command "dialog-accept"
execute_cli with command "dialog-dismiss"
```

## Cross-Origin Iframe Strategy

1. First try `snapshot` — if the target element appears with a ref, use `click <ref>` directly
2. If element is NOT in snapshot (cross-origin boundary):
   - `run-code` to list frames: `page.frames().map(f => ({ name: f.name(), url: f.url() }))`
   - `run-code` to interact: `page.frameLocator('...').locator('...').click()`
3. After successful interaction, use the frame chain as the healed selector
