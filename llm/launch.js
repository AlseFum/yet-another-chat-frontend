import { nanoid } from 'nanoid'
import { LLMJob } from './job.js'
import { LLMKey } from './key.js'

// The caller owns where launch is invoked. This core always runs one Job.
export function launch(requestInput, keyInput) {
  const request = requestInput
  const key = LLMKey.from(keyInput)

  const job = new LLMJob({ id: nanoid(), keyId: key.id, request, createdAt: new Date().toISOString() })
  // Start after launch returns so callers can subscribe before the first state.
  job.result = Promise.resolve().then(() => job.execute(key, request))

  return job
}
