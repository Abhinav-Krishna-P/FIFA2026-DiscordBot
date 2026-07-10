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

  // Find first [ or {
  const firstCurly = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  let startIdx = -1;
  let openChar = '';
  let closeChar = '';

  if (firstCurly !== -1 && (firstBracket === -1 || firstCurly < firstBracket)) {
    startIdx = firstCurly;
    openChar = '{';
    closeChar = '}';
  } else if (firstBracket !== -1 && (firstCurly === -1 || firstBracket < firstCurly)) {
    startIdx = firstBracket;
    openChar = '[';
    closeChar = ']';
  }

  if (startIdx !== -1) {
    let count = 0;
    let inString = false;
    let escape = false;
    let foundEnd = false;
    let endIdx = -1;

    for (let i = startIdx; i < cleaned.length; i++) {
      const char = cleaned[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (char === '\\') {
          escape = true;
        } else if (char === '"') {
          inString = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === openChar) {
          count++;
        } else if (char === closeChar) {
          count--;
          if (count === 0) {
            endIdx = i;
            foundEnd = true;
            break;
          }
        }
      }
    }

    if (foundEnd && endIdx > startIdx) {
      cleaned = cleaned.substring(startIdx, endIdx + 1);
    } else {
      // Fallback to original logic if matching pair not found for some reason
      const lastCloseIdx = closeChar === '}' ? cleaned.lastIndexOf('}') : cleaned.lastIndexOf(']');
      if (lastCloseIdx !== -1 && lastCloseIdx > startIdx) {
        cleaned = cleaned.substring(startIdx, lastCloseIdx + 1);
      }
    }
  }

  return cleaned;
}

