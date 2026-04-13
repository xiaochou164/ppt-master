# Frontend `src` Scaffold

This directory is the starting point for the next-generation frontend rewrite.

Current status:

- the live app still runs from:
  - `webapp/static/app.js`
  - `webapp/static/js/app.*.js`
- this `src/` tree is intentionally not wired into the current HTML yet
- it exists to give the rewrite a clean landing zone without destabilizing the working frontend

## First Iteration Scope

The initial scaffold currently includes:

- `core/api/`
- `core/state/`
- `core/dom/`
- `core/ui/`
- `app/`
- `pages/`
- `features/projects/`

These files are migration-safe scaffolds, not the final implementation.

## Migration Rule

When moving code into `src/`:

1. move payload normalization first
2. move shared state/store helpers second
3. move feature UI code only after the adapter layer is stable
4. keep the current frontend usable until the replacement entry points are ready

## Current Transitional Entries

The rewrite scaffold now also includes page-entry prototypes:

- `src/pages/workspace.js`
- `src/pages/admin.js`

These are not wired into the current HTML yet.

Their purpose is to give the rewrite a place to define page-level view models before replacing the current classic-script boot flow.

## First Migrated Feature

The first feature scaffold now exists at:

- `src/features/projects/`

Current scope:

- project API wrapper
- project models
- create-project step logic
- sources-import step logic
- project-manager logic

This is still transitional and is not yet wired into the live UI, but it now contains real migration logic rather than placeholder-only files.

## Source Of Truth

Use these documents together:

- `PRD.md`
- `FRONTEND_REFACTOR.md`
- `SMOKE_TEST.md`
- `FRONTEND_REWRITE_ROADMAP.md`
