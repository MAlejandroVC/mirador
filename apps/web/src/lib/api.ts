import { healthResponse } from '@repo/api'

// The server is untrusted: every response is checked against its schema.
export async function fetchHealth() {
  const response = await fetch('/api/health')
  if (!response.ok) throw new Error(`Health check failed with ${response.status}`)
  return healthResponse.parse(await response.json())
}
