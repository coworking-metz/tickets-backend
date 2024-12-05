
/**
 * Validates whether a given date string matches one of the supported formats:
 * - YYYY
 * - YYYY-MM
 * - YYYY-MM-DD
 * or is falsy (null, undefined, or an empty string).
 *
 * @param {string|null|undefined} date - The date string to validate.
 * @returns {boolean} - Returns `true` if the date is valid or falsy, otherwise `false`.
 *
 * @example
 * isValidDate("2024"); // true
 * isValidDate("2024-05"); // true
 * isValidDate("2024-05-15"); // true
 * isValidDate(null); // true
 * isValidDate("invalid-date"); // false
 * isValidDate("2024-13"); // false
 * isValidDate("2024-02-30"); // false
 */
export function isValidDateOrPeriod(date) {
  if (!date) {
    return true
  } // Allow falsy values

  const dateRegex = /^\d{4}(-\d{2}(-\d{2})?)?$/ // Match YYYY, YYYY-MM, or YYYY-MM-DD
  if (!dateRegex.test(date)) {
    return false
  }

  // Further validate date components
  const parts = date.split('-')
  const year = Number.parseInt(parts[0], 10)
  const month = parts[1] ? Number.parseInt(parts[1], 10) : null
  const day = parts[2] ? Number.parseInt(parts[2], 10) : null

  if (year < 1 || year > 9999) {
    return false
  } // Year must be valid

  if (month && (month < 1 || month > 12)) {
    return false
  } // Month must be valid

  if (day && (day < 1 || day > 31)) {
    return false
  } // Day must be valid

  return true
}

export function isMacAddress(value) {
  return /^([\dA-F]{2}:){5}([\dA-F]{2})$/.test(value)
}

