/**
 * Lesson 2.1: check the input (query string, JSON body, URL params) with Zod BEFORE
 * our code runs. Bad input → 400 Problem Details listing every field that is wrong.
 */
import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { ZodType } from 'zod'
import { problem } from './problem'

export const validate = <T extends ZodType, K extends keyof ValidationTargets>(target: K, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({ field: i.path.join('.') || target, message: i.message }))
      return problem(c, 400, errors.map((e) => `${e.field}: ${e.message}`).join('; '), { errors })
    }
  })
