# Frontend Rewrite Roadmap

## Goal

This roadmap turns the current refactored frontend into a staged rewrite plan.

It is designed for the current project reality:

- the legacy monolith has already been split into `app.*` domain modules
- the backend contracts have been partially corrected
- a no-cost smoke pass has already identified the main frontend/backend mismatches

The purpose of this document is to answer:

1. what to keep as the behavior baseline
2. what to rewrite first
3. what not to rewrite all at once
4. how to reduce regression risk while moving to a cleaner architecture

## Current Reality

### Stable Baseline

Use these as the current source of truth:

- `PRD.md`
- `FRONTEND_REFACTOR.md`
- `SMOKE_TEST.md`

Use the current refactored frontend as the behavior baseline:

- `webapp/static/app.js`
- `webapp/static/js/app.*.js`

### Important Caution

The repository still contains older frontend code that should not be treated as the active baseline for rewrite decisions:

- `webapp/static/js/main.js`
- `webapp/static/js/state.js`
- `webapp/static/js/constants.js`
- `webapp/static/js/modules/*`

These files are useful only as historical reference. The active behavior baseline is the `app.*` set plus the current HTML pages.

## Rewrite Principles

### Principle 1: Preserve Backend Contracts First

Do not begin by changing backend APIs.

The rewrite should first preserve the corrected contracts already aligned in the current frontend:

- project creation
- source import
- template apply
- design spec save
- model config actions
- admin pagination and filters
- SVG SSE handling

If the rewrite breaks one of these, it should be treated as a regression.

### Principle 2: Separate Data Adaptation From UI Rendering

One of the biggest real problems found during smoke testing was shape mismatch:

- dashboard payload shape
- project summary shape
- template payload shape
- format payload shape

The rewrite should make payload normalization explicit and centralized.

Recommended rule:

- all backend payload adaptation belongs in one place
- UI components should consume normalized frontend models only

### Principle 3: Replace Global Coupling Gradually

The current frontend still relies on:

- classic multi-script loading
- `window.PPTM_*`
- shared mutable state
- bootstrap-time dependency wiring

That is acceptable as a migration bridge, but not as the final architecture.

The rewrite should replace this in layers instead of flipping everything at once.

### Principle 4: Keep One Working Path At All Times

Do not rewrite every page at once.

At each iteration:

- one vertical slice should be migrated
- existing flows should stay usable
- smoke checks should still pass

## Recommended Target Architecture

Recommended next-generation structure:

```text
webapp/static/src/
  core/
    api/
      client.js
      adapters.js
      errors.js
    state/
      store.js
      selectors.js
      actions.js
    dom/
      query.js
    ui/
      flash.js
      modal.js
      validation.js
      preview.js
    app/
      bootstrap.js
      router.js

  features/
    auth/
      api.js
      state.js
      account-settings.js
      user-badge.js
    projects/
      api.js
      models.js
      project-step.js
      sources-step.js
      project-manager.js
    templates/
      api.js
      models.js
      template-step.js
      template-manager.js
    strategist/
      api.js
      models.js
      strategist-step.js
    pipeline/
      api.js
      image-step.js
      executor-step.js
      postprocess-step.js
      sse.js
    models/
      text-model-modal.js
      image-model-modal.js
      api.js
    admin/
      api.js
      users-panel.js
      audit-panel.js

  pages/
    workspace.js
    admin.js
```

## Rewrite Order

### Iteration 1: Core Foundation

Goal:

- build the new technical foundation without changing visible behavior yet

Deliverables:

- `core/api/client.js`
- `core/api/adapters.js`
- `core/state/store.js`
- `core/ui/modal.js`
- `core/ui/flash.js`
- `core/ui/validation.js`
- `app/bootstrap.js`

Must include:

- centralized `fetch` wrapper
- centralized error normalization
- centralized payload normalization for:
  - dashboard
  - project
  - templates
  - admin users
  - audit logs

Migration note:

- keep current `app.js` alive
- let new core utilities be imported or mirrored first
- do not rewrite business steps yet

Exit criteria:

- no user-visible regression
- current smoke-tested no-cost flows still work

### Iteration 2: Projects + Sources

Goal:

- migrate Step 1 and Step 2 into the new structure

Deliverables:

- `features/projects/api.js`
- `features/projects/models.js`
- `features/projects/project-step.js`
- `features/projects/sources-step.js`
- `features/projects/project-manager.js`

Scope:

- create project
- recent project switch
- source import
- source preview
- validate project
- project manager modal

Why this iteration first:

- these flows are low-cost
- they already have confirmed backend contracts
- they exercise the core adapter layer well

Exit criteria:

- create/import/delete/switch project flows still pass smoke

### Iteration 3: Templates + Strategist

Goal:

- migrate Step 3 and Step 4 together because they are tightly connected

Deliverables:

- `features/templates/api.js`
- `features/templates/models.js`
- `features/templates/template-step.js`
- `features/templates/template-manager.js`
- `features/strategist/api.js`
- `features/strategist/models.js`
- `features/strategist/strategist-step.js`

Scope:

- template loading
- template apply
- free-design fallback
- template manager list/detail/upload/delete
- strategist form rendering
- design spec save

Special note:

- keep template payload normalization explicit
- do not rely on raw backend `categories` structure directly in UI

Exit criteria:

- apply template leads into strategist correctly
- design spec save returns the user to a consistent step state

### Iteration 4: Models + Auth

Goal:

- isolate all modal-heavy, stateful configuration flows

Deliverables:

- `features/models/api.js`
- `features/models/text-model-modal.js`
- `features/models/image-model-modal.js`
- `features/auth/api.js`
- `features/auth/account-settings.js`
- `features/auth/user-badge.js`

Scope:

- text model config modal
- image model config modal
- account settings
- logout
- user badge rendering

Why here:

- these areas are stateful but mostly independent of the main workspace flow
- they benefit from a cleaner modal/state abstraction

Exit criteria:

- modal open/close/dirty-check behavior remains stable
- account settings still match `/api/me`

### Iteration 5: Pipeline

Goal:

- migrate the highest-risk generation flow only after the core and earlier steps are stable

Deliverables:

- `features/pipeline/api.js`
- `features/pipeline/sse.js`
- `features/pipeline/image-step.js`
- `features/pipeline/executor-step.js`
- `features/pipeline/postprocess-step.js`

Scope:

- image generation UI
- SVG generation
- SVG regeneration
- SVG deletion
- notes generation
- postprocess step execution
- delivery area

Special note:

- SSE parsing should be isolated and testable
- do not bury event parsing inside DOM code

Exit criteria:

- no-cost UI rendering remains stable
- model-backed execution can be tested separately after explicit approval

### Iteration 6: Admin

Goal:

- migrate admin as an isolated page shell

Deliverables:

- `pages/admin.js`
- `features/admin/api.js`
- `features/admin/users-panel.js`
- `features/admin/audit-panel.js`

Scope:

- users list
- user detail
- create local user
- role/status updates
- purge sessions
- audit filters
- audit pagination
- audit export

Why last:

- admin is page-isolated and easier to migrate once shared infrastructure is stable

Exit criteria:

- admin filters and detail synchronization remain correct

## What Not To Do

### Do Not Rewrite The HTML And JS Architecture In One Step

Avoid:

- replacing all HTML pages at once
- deleting all global scripts before the new page bootstraps are proven

### Do Not Mix Old `modules/*` As Active Dependencies

The old `webapp/static/js/modules/*` files should not become part of the new rewrite plan.

They create confusion because they represent a different earlier structure.

Recommended approach:

- treat them as read-only historical reference
- after the new rewrite stabilizes, remove them in a cleanup pass

### Do Not Couple Raw Backend Payloads To Components

If a component needs conditionals like:

- `project.design_spec?.url || project.design_spec_path || project.path`

that logic belongs in adapters, not in rendering code.

## Suggested Deliverable Sequence

Recommended practical order:

1. create `webapp/static/src/core/*`
2. build adapters for dashboard/project/templates/admin payloads
3. move projects flow
4. move templates + strategist
5. move auth + model modals
6. move pipeline
7. move admin
8. remove dead bridge code
9. remove stale legacy `js/modules/*`

## Definition Of Done For The Rewrite

The rewrite should be considered complete only when:

1. `app.js` is no longer the main business wiring hub
2. payload normalization is centralized
3. workspace and admin each have clear page entry files
4. no active feature depends on legacy `js/modules/*`
5. no-cost smoke flows still pass
6. model-backed flows are revalidated after config is available

## Recommended Immediate Next Step

Start with Iteration 1 only.

Do not begin with pipeline or admin first.

The best first implementation task is:

- scaffold `webapp/static/src/core/`
- move API client + payload adapters there
- keep current pages running while the new foundation is introduced in parallel
