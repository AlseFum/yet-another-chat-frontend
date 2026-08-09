# Architecture

## Overview

Yet Another Agent is organized around a small runtime primitive, `Job`. Applications build
business-specific `JobRequest` objects, while `Workspace` chooses whether the request runs
directly in the browser or through the backend.

```text
Vue view
  -> Application model
  -> request factory
  -> Workspace.createJob()
  -> JobManager
     -> direct LLMJob
     -> remote BrowserRemoteJob
```

The application model owns user-facing state. The Job model owns provider execution state.
They are intentionally separate so a Conversation can retain a stable `jobId` while the
Job itself streams, retries, completes, or is restored from a server snapshot.

## Workspace Boundaries

Each workspace has independent:

- Application state
- Resources: Text, Preset, Tool and Persona
- Custom settings
- API Key records
- Job snapshots

`KeyRef.temporary()` keeps a credential in browser memory. `KeyRef.server()` carries only a
server-side key ID. API keys must never be serialized into Application state, `JobRequest`,
or Job snapshots.

## Job Lifecycle

Applications should use `Workspace.createJob()` rather than calling a JobManager directly.
The important callbacks are:

- `onCreated(job)`: the Job ID exists, before remote execution starts; persist the business association here.
- `onEvent(event)`: apply deltas, results, and terminal state transitions to application state.
- `metadata`: identify the application, workspace object, conversation, run, or participant.

The usual flow is:

```text
create business draft
  -> createJob
  -> onCreated: persist jobId
  -> start direct/remote execution
  -> onEvent: update streaming output
  -> terminal event: clear streaming state and save
```

On `revive()`, applications look up every persisted active `jobId`, apply the latest snapshot,
and subscribe to future events. Direct browser Jobs cannot survive a page refresh; server Jobs
can be recovered from the backend store.

## Chat Modes

Chat has separate semantic modes. They must not share prompt assumptions merely because they
share a UI:

- `raw`: user-owned System Prompt, optional explicitly selected Tools, no Persona.
- `single`: one Persona and plain `user`/`assistant` history. No User Mask, roster or Outlook.
- `multi`: one Job per participant for a single user turn. Participants can reference the same Persona Resource and use aliases to distinguish instances.
- `multi` with `policy: orchestrated`: a control Job validates Action Contracts and dispatches bounded Actor Jobs.

Prompt construction belongs in small, testable serializers and request factories. A mode must
only receive the context it is allowed to see:

```text
single -> current Persona + conversation direction + plain history
multi  -> current Persona + User Mask + participant roster + other participants' Outlook
actor  -> current Persona + User Mask + Action Context + allowed tools + contract output
```

Other participants' full Persona sections are private to those participants and must not be
used as ordinary context for another participant. Outlook is an explicit public-facing summary
for multi-role recognition, not a second Persona prompt.

## Resources and References

Persona sections use a selector at the beginning of the section name, for example:

```text
[chat]Conversation style
[outlook]First impression in a group
[talk:private]Private behavior
[talk:public]Public behavior
```

`projectPersona()` filters sections by target. Text items using `@[resource-id]` are expanded
at request-build time through a read lease, and the expanded text is stored in the JobRequest
snapshot.

## Extension Rules

When adding an Application:

1. Keep business state in a model class independent from Vue.
2. Put request construction in a dedicated `*-job-request.js` module.
3. Create Jobs only through `Workspace.createJob()`.
4. Persist the Job ID before execution can produce user-visible output.
5. Add tests for serialization, validation, terminal state, and refresh recovery.
6. Update `web/src/applications/SPEC.md` when a new state or boundary is introduced.
