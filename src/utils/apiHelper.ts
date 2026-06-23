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

/**
 * Extracts and cleans a JSON string from a potentially malformed or markdown-wrapped raw response.
 * It removes backticks, code blocks, and any leading/trailing garbage.
 */
export function cleanJSONString(raw: string): string {
  let cleaned = raw.trim();
  // Remove markdown code blocks like ```json ... ``` or ``` ... ```
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = cleaned.match(codeBlockRegex);
  if (match) {
    cleaned = match[1].trim();
  }

  // Find first [ or { and last ] or } to extract only the JSON structure
  const firstCurly = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  let startIdx = -1;
  let endIdx = -1;

  if (firstCurly !== -1 && (firstBracket === -1 || firstCurly < firstBracket)) {
    startIdx = firstCurly;
    endIdx = cleaned.lastIndexOf('}');
  } else if (firstBracket !== -1 && (firstCurly === -1 || firstBracket < firstCurly)) {
    startIdx = firstBracket;
    endIdx = cleaned.lastIndexOf(']');
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  return cleaned;
}
