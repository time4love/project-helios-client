const DEVICE_ID_KEY = 'helios_device_id'

/**
 * Get or generate a persistent anonymous device identifier.
 * Uses localStorage to persist the ID across sessions.
 * Generates a new UUID if one doesn't exist.
 */
export function getDeviceId(): string {
  // Check if we already have a device ID stored
  const existingId = localStorage.getItem(DEVICE_ID_KEY)

  if (existingId) {
    return existingId
  }

  // Generate a new UUID using the Web Crypto API
  const newId = crypto.randomUUID()

  // Persist to localStorage for future sessions
  localStorage.setItem(DEVICE_ID_KEY, newId)

  return newId
}
