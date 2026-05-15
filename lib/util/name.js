import {getNumberFromSeed} from './random.js'

const FIRSTNAMES = ['Sophie', 'Louise', 'Juliette', 'Clara', 'Émilie', 'Margot', 'Louisette', 'Isabelle', 'Valérie', 'Caroline', 'Patricia', 'Monique', 'Nicole', 'Olivia', 'Pauline', 'Béatrice', 'Bernadette', 'Colette', 'Hélène', 'Suzanne', 'Chantal', 'Danielle', 'Sylvie', 'Isabelle', 'Catherine', 'Brigitte', 'Josette', 'Madeleine']
const LASTNAMES = ['Plume', 'Picore', 'Cocotte', 'Caquete', 'Poulette', 'Couvée', 'Nid', 'Éclosion', 'Volaille', 'Caille', 'Pondue', 'Muesli', 'Coquille', 'Oeuf', 'Paille', 'Bec', 'Poussine', 'Oeufine', 'Cotcot', 'Caquet', 'Poulinette', 'Grattelle', 'Pioupiou', 'Poulette', 'Piaille', 'Picote', 'Becquée', 'Plume']

/**
 * Retrieve a random name from the list of firstnames and lastnames
 * with a seed to make it deterministic
 * @param {string} seed
 * @returns
 */
export function getRandomFirstname(seed = `${Math.random()}`) {
  const firstname = FIRSTNAMES[getNumberFromSeed(seed) % FIRSTNAMES.length]
  return firstname
}

export function getRandomLastname(seed = `${Math.random()}`) {
  const lastname = LASTNAMES[getNumberFromSeed(seed) % LASTNAMES.length]
  return lastname
}
