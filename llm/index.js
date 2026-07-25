/**
 * Public LLM facade for application code outside this directory.
 * Internal LLM modules use relative imports to keep implementation layers
 * independent and avoid circular dependencies through this entry point.
 */

// --- Request factories ---
export {
  createChatJobRequest,
  createHighlightRulesJobRequest,
  createPresetWriterJobRequest,
  createTalkStageJobRequest,
  createTalkWriterJobRequest,
  createToolWriterJobRequest,
  createWorkflowPromptJobRequest,
} from './jobs.js'

// --- Request policies and runtime types ---
export { JobRequest, createJSONValidator, createRepairRetrier, createSchemaValidator } from './job-request.js'
export { EventBus, LLMJob, StateMachine } from './job.js'
export { ApiConfig } from './api-config.js'

// --- Provider transport and server infrastructure ---
export { Provider } from './provider.js'
export { createLLMFetch } from './fetch.js'
export { createLLMJobManager } from './create.js'

// --- Talk prompt definitions ---
export { PROMPT_STAGES, buildPromptContext, buildStageMessages, talkStageSchema } from './prompts/talk.js'
