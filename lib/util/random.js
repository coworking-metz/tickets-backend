/**
 * Get a random number from a seed
 * to make it deterministic
 * @param {string} seed
 * @returns {number}
 */
export const getNumberFromSeed = seed => Number.parseInt([...`${seed}`].reduce((acc, char) => acc + char.codePointAt(0), 0), 10)
