import { z } from 'zod'

import { getRuntimeEnv } from './runtime-env'

const optionalNonEmptyString = z.preprocess(
  value => (typeof value === 'string' && !value.trim() ? undefined : value),
  z.string().min(1).optional(),
)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:3300'),
  UNSPLASH_ACCESS_KEY: optionalNonEmptyString,
  PAYSTACK_SECRET_KEY: optionalNonEmptyString,
  PAYSTACK_CURRENCY: z
    .string()
    .trim()
    .length(3, 'PAYSTACK_CURRENCY must be a 3-letter code')
    .transform(value => value.toUpperCase())
    .default('NGN'),
  PAYSTACK_ALLOWED_CURRENCIES: z
    .string()
    .trim()
    .default('')
    .transform(value =>
      Array.from(
        new Set(
          value
            .split(',')
            .map(currency => currency.trim().toUpperCase())
            .filter(currency => /^[A-Z]{3}$/.test(currency)),
        ),
      ),
    )
    .transform(currencies => (currencies.length > 0 ? currencies : ['NGN'])),
})

export const env = envSchema.parse(getRuntimeEnv())

export type Env = typeof env
