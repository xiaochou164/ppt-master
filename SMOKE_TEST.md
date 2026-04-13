# Frontend Smoke Test Notes

## Scope

This document captures the current lightweight smoke-test status for the refactored frontend.

The goal is not full browser automation. It is to record:

- which flows have been verified against the real backend
- which frontend/backend mismatches were discovered and fixed
- which flows were intentionally not executed because they trigger real model costs

## Environment

- repo: `ppt-master`
- frontend entry:
  - `webapp/static/app.js`
  - `webapp/static/index.html`
  - `webapp/static/admin.html`
- backend:
  - FastAPI app in `webapp/app.py`
- local endpoint used during checks:
  - `http://127.0.0.1:8765`

## Verified Flows

### Workspace Initialization

Verified:

- homepage HTML loads
- `/static/app.js` is served correctly
- `/api/dashboard` returns data successfully

Important finding:

- backend `dashboard.steps` is not the main workspace flow
- backend returns post-processing steps there
- frontend now uses its own `FLOW_STEPS` as the canonical workspace step rail

### Project Flow

Verified against the real backend:

1. create project
2. import pasted markdown source
3. apply template
4. save design spec
5. delete temporary project

Temporary project used and deleted during smoke:

- `smoke-20260411-180617`

Confirmed backend contracts:

- `POST /api/projects`
- `POST /api/projects/{ref}/import`
- `POST /api/projects/{ref}/apply-template`
- `POST /api/projects/{ref}/design-spec`
- `DELETE /api/projects/{ref}`

### Template Data Loading

Verified:

- `/api/templates` returns data successfully
- template page can now load templates on demand
- template manager can now map backend category metadata correctly

Important findings fixed:

- backend template objects do not reliably expose the old frontend `name/category` shape
- backend category entries use `{ label, layouts }`
- frontend now derives:
  - `name`
  - `category`
  - `category_label`
  - preview URL compatibility

### Admin Data Flow

Verified by reading real backend routes and aligning frontend behavior:

- admin users list route exists
- admin user detail route exists
- admin audit log route exists
- admin audit export route exists
- admin user update route exists
- admin purge sessions route exists

Confirmed backend contracts:

- `GET /api/admin/users`
- `GET /api/admin/users/{id}`
- `PATCH /api/admin/users/{id}`
- `POST /api/admin/users/{id}/sessions/purge`
- `GET /api/admin/audit-logs`
- `GET /api/admin/audit-logs/export`

Frontend fixes made during this smoke phase:

- admin filters now trigger real reloads
- admin audit filters now trigger real reloads
- admin audit page indicator now updates
- stale user detail is cleared when filtered-out users disappear from the current page

### Manager Modals

Verified structurally:

- project manager modal DOM exists
- template manager modal DOM exists
- account settings modal DOM exists

Frontend fixes made:

- project manager opens with the current project preselected
- project switch/delete now keep detail state in sync
- template manager now loads backend template data into a normalized shape
- template upload form now matches backend requirements

Confirmed template upload backend requirements:

- `name`
- `label`
- `category`
- `summary`
- `keywords`
- `files`

## Intentionally Not Executed

These flows were not run because they would trigger real model calls or external cost:

### Image Generation

Not executed.

Reason:

- current image model config is not set up
- backend currently reports `image_model_config.configured = false`

### Strategist Analyze

Not executed as a live model call.

Reason:

- it depends on a configured text model
- it may call real upstream model services

### SVG Generation

Not executed as a live generation stream.

Reason:

- it depends on a configured text model
- it would trigger real model generation and streaming side effects

### Notes Generation / Postprocess / Export

Not executed.

Reason:

- these depend on previous generated artifacts
- full validation is better done after confirming model-backed generation paths

## Important Fixes Found During Smoke

The following issues were discovered or confirmed during smoke-style checks and fixed:

1. dashboard/project payloads needed a normalization layer
2. backend formats are object arrays, not plain strings
3. backend template payload shape differed from frontend assumptions
4. template page did not proactively load templates
5. recent project buttons were rendered but not wired
6. admin filter controls updated state but did not refresh data
7. template upload UI did not satisfy backend required form fields
8. manager modal states could become stale after switch/delete/apply/save actions

## Remaining Risks

- no true browser automation has been run
- no DOM-level click-through has been executed in a real browser engine
- model-backed steps are still only contract-checked, not fully executed
- the app still uses classic multi-script globals, so cross-module coupling risk is lower than before but not gone

## Recommended Next Pass

### Low-Risk Next Pass

Recommended next:

1. manual browser click-through for:
   - project manager
   - template manager
   - account settings
   - admin filters and paging

### Higher-Cost Next Pass

Only after explicit approval:

1. configure image model profile
2. configure text model profile
3. run live checks for:
   - strategist analyze
   - image generation
   - svg generation
   - postprocess steps

## Summary

Current status:

- the frontend is now in a much safer state for rewrite work
- core no-cost flows have been checked against the real backend
- the highest remaining uncertainty is concentrated in model-backed generation flows and lack of true browser automation
