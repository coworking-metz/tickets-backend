/**
 * Generates a universally unique identifier (UUID) following version 4 standards.
 * The UUID is a 36 character length string (including 4 hyphens),
 * with hexadecimal characters in the format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx,
 * where x is any hexadecimal digit and y is one of 8, 9, A, or B.
 * @returns {string} - The generated UUID.
 *
 * @example
 * const id = genUUID();
 * console.log(id); // Outputs something like: '3b2412c1-37f9-4ff5-8abc-726595f448ea'
 */
export function genUUID() {
  // Function to generate a random integer between 0 and 15
  const randomHex = () => Math.floor(Math.random() * 16).toString(16)

  // Generate UUID segments
  const s4 = () => randomHex() + randomHex() + randomHex() + randomHex()
  const s3 = () => randomHex() + randomHex() + randomHex()

  // Construct the UUID using specific format
  return `${s4()}${s4()}-4${s3()}-y${s3()}-${
    (8 + Math.floor(Math.random() * 4)).toString(16) // Variant code 8, 9, A, or B
  }${s3()}-${s4()}${s4()}`
}
