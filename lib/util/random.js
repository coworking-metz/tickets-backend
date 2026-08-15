/**
 * Get a random number from a seed
 * to make it deterministic
 * @param {string} seed
 * @returns {number}
 */
export const getNumberFromSeed = seed => Number.parseInt([...`${seed}`].reduce((acc, char) => acc + char.codePointAt(0), 0), 10)

/**
 * Reorder an array by rotating it, seeded to be deterministic
 * @param {Array} array
 * @param {string} seed
 * @returns {Array}
 */
export const shuffleWithSeed = (array, seed) => {
  const offset = array.length === 0 ? 0 : getNumberFromSeed(seed) % array.length
  return [...array.slice(offset), ...array.slice(0, offset)]
}
