/**
 * Lesson 2.1/2.2: what happens when the input does not match the schema.
 * Used as the `defaultHook` of every OpenAPIHono router → 400 Problem Details
 * listing every wrong field.
 */
import type { Context } from 'hono'
import type { ZodError } from 'zod'
import { problem } from './problem'

type HookResult = { success: true } | { success: false; error: ZodError; target?: string }

export function validationHook(result: HookResult, c: Context) {
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ field: i.path.join('.') || 'input', message: i.message }))
    return problem(c, 400, errors.map((e) => `${e.field}: ${e.message}`).join('; '), { errors })
  }
}
