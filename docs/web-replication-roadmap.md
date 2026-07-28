# Web Workbench Replication Roadmap

## Scope

The Web workbench reproduces the useful interface and interaction model from
`/home/ubuntu/myagent/web` without adopting its server conversation engine,
TUI client model, transport, persisted runtime data, or text mention syntax.

The first phase is UI-only. It uses in-memory fixtures and makes no backend or
LLM requests.

## Workspace Model

A Workspace composes optional Application capabilities. It may contain one
instance of each Application type:

- `ChatApplication`
- `ResourceApplication`, which owns Text, Preset, and Tool resources

Talk and Workflow are deferred possibilities, not part of the current Web UI
or dependency graph.

Application instances are Workspace-scoped singletons. A Workspace registry
creates each enabled Application at most once and returns the same instance
for subsequent lookups. Closing the Workspace disposes all of its instances.
Applications must not be exported as module-global singletons because that
would leak state between workspaces and tests.

Cross-Application collaboration goes through capabilities exposed by the
Workspace, not through direct access to another Application's private state.

## Persistence Model

Each resource is stored in its own JSON file. Editing one resource must not
rewrite the complete Workspace.

```text
data/<workspace>/
  workspace.json
  applications/
    chat.json
    talk.json
    workflow.json
    resource.json
  chats/<id>.json
  talks/<id>.json
  workflows/<id>.json
  texts/<id>.json
  presets/<id>.json
  tools/<id>.json
  jobs/<id>.json
```

`workspace.json` contains metadata and enabled Application types. Application
files contain only Application configuration. Resource bodies stay in their
individual files. Resource writes will later use temporary files and atomic
replacement.

## Theme Contract

Feature UI consumes semantic design tokens and theme assets. It must not own
theme-specific colors, easing curves, shadows, blur values, or SVG paths.

A theme package provides:

- dark and light color schemes
- typography, spacing, sizing, radius, shadow, and blur tokens
- motion durations, easing curves, movement distances, and scale tokens
- CodeMirror tokens and semantic status colors
- an SVG icon registry
- optional logos, illustrations, and decorative assets
- pseudo-element decoration tokens for stable Workbench, TopBar, Section,
  Panel, and message hooks
- component tokens for Modal, Combobox, Switch, inline Message, and Toast

`AppIcon` resolves icons from the active theme. Replacing a theme can therefore
replace SVG geometry as well as CSS tokens without changing feature components.
Reduced-motion preferences disable non-essential transforms and animations.
Pseudo-element hooks are declared once in the base UI; themes control their
backgrounds, geometry, opacity, borders, and transforms without introducing
theme selectors into feature components. Background tokens may reference local
theme images with `url(...)`; decorative image files stay inside that theme.

## Deferred Decisions

Text binding is intentionally unspecified. Phase one contains no `@` mention
parser, mention menu, reference chips, or implied replacement design. Text
binding will receive a separate design review before resource integration.

## Phase 1: Themeable UI Replica

- Create the independent Vue/Vite Web project.
- Implement the theme registry, token package, icon registry, and contract check.
- Reproduce the responsive shell, sidebar, top bar, settings panel, toast, and
  shared controls.
- Keep transient Toast notifications separate from persistent inline Messages,
  and provide shared Modal and responsive Combobox controls.
- Reproduce Chat, Text, Preset, Tool, API Key, LLM Job, and Workspace transfer
  views using in-memory fixtures.
- Make navigation, local edits, panels, dialogs, theme mode, mobile sidebar,
  and the demonstration workflow canvas interactive.
- Do not import or call TUI frontend code.
- Do not issue network requests or persist fixture changes.

Acceptance:

- `npm run web:check-theme` passes.
- `npm run web:build` passes.
- Desktop and mobile layouts remain usable.
- Feature components contain no theme-specific colors, easing curves, or raw
  SVG definitions.
- Reloading resets the fixtures.

## Phase 2: Workspace and Application Runtime

- Implement the Workspace lifecycle and scoped singleton registry.
- Implement Application enable/disable and capability discovery.
- Define UI-facing interfaces for each Application without backend hooks.
- Replace fixture navigation state with Application view models.

## Phase 3: Resource Repositories and API

- Implement one-JSON-per-resource repositories and atomic writes.
- Add summary-list and detail CRUD APIs for Application configuration and each
  resource type.
- Load full resource documents only when required.
- Keep protected Key storage outside generic resource mutation.

## Phase 4: Browser Runtime

- Implement browser-native HTTP and streaming clients with `fetch`, WebSocket,
  streams, and `AbortController` as appropriate.
- Integrate Job snapshots and deltas without deriving behavior from the TUI.
- Connect API Key and Job observation views.

## Phase 5: ResourceApplication

- Connect Text, Preset, and Tool CRUD and editors.
- Review and decide Text binding before adding any binding UI or serialization.
- Add resource generation only after Job integration is stable.

## Phase 6: ChatApplication

- Connect conversation and message CRUD.
- Build Job requests in the browser Application.
- Add streaming content, reasoning, abort, history editing, and tool loops.
- Keep conversation orchestration out of the backend.

## Optional Future: WorkflowApplication

- Migrate graph validation and execution logic independently of the old UI
  event bridge.
- Connect typed nodes, execution state, Job nodes, and run logs.
- Persist each Workflow separately.

## Optional Future: TalkApplication

- Connect Talk and Session resources, clock, state, memory, plans, and runtime.
- Keep the five-stage pipeline in the browser Application.
- Persist each Talk separately and do not claim background execution while the
  page is closed.

## Transfer and Hardening

- Add versioned Workspace import/export for per-resource storage.
- Add theme installation/selection and migration rules.
- Complete accessibility, responsive, performance, and regression checks.
