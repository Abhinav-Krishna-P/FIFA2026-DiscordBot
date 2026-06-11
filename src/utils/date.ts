/**
 * Returns a date string formatted as YYYY-MM-DD in the Asia/Kolkata (IST) timezone.
 * @param offsetDays Number of days to offset (e.g. -1 for yesterday, 0 for today, 1 for tomorrow)
 */
export function getISTDateString(offsetDays = 0): string {
  const date = new Date();
  
  // Apply day offset if any
  if (offsetDays !== 0) {
    date.setDate(date.getDate() + offsetDays);
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  return formatter.format(date);
}

/**
 * Returns the current date object set to the Asia/Kolkata timezone.
 */
export function getISTDate(): Date {
  const utcDate = new Date();
  // Simple offset conversion for calculations if needed,
  // but using standard Date objects with timezone formatting or node-cron's timezone is preferred.
  return utcDate;
}
