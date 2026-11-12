import { reseed } from './db.js'

/** dynamodb-local may still be booting, so retry for up to 60 s. */
export default async function globalSetup(): Promise<void> {
  const deadline = Date.now() + 60_000
  for (;;) {
    try {
      await reseed()
      return
    } catch (e) {
      if (Date.now() > deadline) throw e
      await new Promise((r) => setTimeout(r, 1_000))
    }
  }
}
