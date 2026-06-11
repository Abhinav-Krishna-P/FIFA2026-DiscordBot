/**
 * Executes a function returning a promise, retrying it if it fails.
 * Uses exponential backoff to handle rate limits (e.g. HTTP 429) and transient network errors.
 * 
 * @param fn The function to execute
 * @param retries Number of retry attempts
 * @param delay Initial delay in milliseconds
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 2000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }
    console.warn(`[API Helper] Request failed. Retrying in ${delay}ms... Error:`, error);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return callWithRetry(fn, retries - 1, delay * 2);
  }
}
