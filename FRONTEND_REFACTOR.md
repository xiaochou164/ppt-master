# Frontend Refactor Notes

## Goal

This frontend has been refactored from a single large `app.js` into a bootstrap entry plus domain modules. The current state is suitable as a stable baseline for further rewrite work.

## Current Entry Files

- `webapp/static/app.js`
- `webapp/static/index.html`
- `webapp/static/admin.html`

`app.js` is now mainly responsible for:

- shared fetch/error wrapper
- module assembly and dependency wiring
- a small amount of cross-module glue
- page bootstrapping

## Current Module Split

### Foundations

- `webapp/static/js/app.constants.js`
  - flow steps
  - pipeline guide constants

- `webapp/static/js/app.state.js`
  - initial state factories
  - draft factories

- `webapp/static/js/app.dom.js`
  - DOM element cache

- `webapp/static/js/app.utils.js`
  - formatting and text helpers

- `webapp/static/js/app.ui.js`
  - flash
  - busy state
  - modal/focus trap
  - log rendering
  - SVG preview
  - doc preview
  - inline validation
  - password toggle

### Domain Modules

- `webapp/static/js/app.auth.js`
  - current user
  - user badge
  - logout
  - account settings

- `webapp/static/js/app.projects.js`
  - create project
  - import sources
  - validate project
  - source preview
  - refresh selected project

- `webapp/static/js/app.templates.js`
  - template step rendering
  - template gallery
  - template apply
  - free-design fallback message

- `webapp/static/js/app.strategist.js`
  - strategist analysis
  - eight confirmations form
  - design-spec submit

- `webapp/static/js/app.pipeline.js`
  - image generation
  - executor
  - SVG stream handling
  - postprocess
  - delivery area

- `webapp/static/js/app.models.js`
  - text model config
  - image model config
  - save/test/delete profile

- `webapp/static/js/app.managers.js`
  - project manager modal
  - template manager modal
  - template upload

- `webapp/static/js/app.admin.js`
  - admin users list
  - admin user detail
  - audit logs

- `webapp/static/js/app.shell.js`
  - dashboard load
  - project context
  - step rail
  - stage routing
  - global event binding
  - app/admin bootstrap

## Important Backend Contracts Already Corrected

The following frontend/backend mismatches have already been fixed:

- project create uses:
  - `POST /api/projects`
  - body: `{ project_name, canvas_format }`

- source import uses:
  - `POST /api/projects/{ref}/import`
  - body:
    - `{ sources: [...] }`, or
    - `{ pasted_content, pasted_format, pasted_filename }`

- template apply uses:
  - `POST /api/projects/{ref}/apply-template`

- strategist analyze uses:
  - `POST /api/projects/{ref}/analyze`

- design spec uses:
  - `POST /api/projects/{ref}/design-spec`
  - body: `{ spec: {...} }`

- generate svg uses:
  - `POST /api/projects/{ref}/generate-svg`
  - SSE events: `start`, `page_complete`, `page_error`, `complete`

- regenerate svg uses:
  - `POST /api/projects/{ref}/regenerate-svg`
  - body: `{ regenerate_all: true }`

- delete svg uses:
  - `POST /api/projects/{ref}/delete-svg`
  - body: `{ delete_all: true }`

- generate notes uses:
  - `POST /api/projects/{ref}/generate-notes`

- account settings uses:
  - `PATCH /api/me`

- admin update user uses:
  - `PATCH /api/admin/users/{id}`

- admin purge sessions uses:
  - `POST /api/admin/users/{id}/sessions/purge`

- model config uses:
  - `POST /api/model-config`
  - `POST /api/image-model-config`
  - action-based payloads

## Known Product/Backend Constraints

- free design currently has no backend route
  - frontend now shows an explicit error instead of pretending the feature works

- image generation depends on an available default image model profile

- strategist/executor/notes generation depend on an available default text model profile

## Suggested Next Rewrite Direction

### Option A: Keep current architecture and refine

Recommended if you want low-risk incremental cleanup.

Suggested next steps:

1. keep `webapp/static/app.js` as a thin bootstrap layer
2. move any remaining cross-module glue into explicit adapters only when it improves clarity
3. add a lightweight browser smoke test checklist

### Option B: Rewrite to ESM modules

Recommended if you want long-term maintainability.

Suggested target structure:

- `core/`
  - api
  - state
  - dom
  - router
  - modal

- `features/projects/`
- `features/templates/`
- `features/strategist/`
- `features/pipeline/`
- `features/models/`
- `features/admin/`

## Highest Remaining Risks

- no automated browser regression yet
- `app.js` is much smaller now, but still keeps some bootstrap-era glue because the page still uses a classic multi-script load model
- some stage-to-module dispatch still depends on legacy global bootstrap structure

## Recommended Immediate Follow-up

See also: `SMOKE_TEST.md` for the latest no-cost smoke status and remaining unverified flows.
See also: `FRONTEND_REWRITE_ROADMAP.md` for the staged rewrite plan.

1. do one browser smoke pass on:
   - login state
   - create project
   - import source
   - apply template
   - strategist save
   - generate image
   - generate svg
   - postprocess
   - admin user detail

2. after smoke pass, either:
   - keep trimming `app.js`, or
   - start a clean ESM rewrite using this file as a behavior map
