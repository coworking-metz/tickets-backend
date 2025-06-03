const FIRSTNAMES = ['Sophie', 'Louise', 'Juliette', 'Clara', 'Émilie', 'Margot', 'Louisette', 'Isabelle', 'Valérie', 'Caroline', 'Patricia', 'Monique', 'Nicole', 'Olivia', 'Pauline', 'Béatrice', 'Bernadette', 'Colette', 'Hélène', 'Suzanne', 'Chantal', 'Danielle', 'Sylvie', 'Isabelle', 'Catherine', 'Brigitte', 'Josette', 'Madeleine']
const LASTNAMES = ['Plume', 'Picore', 'Cocotte', 'Caquete', 'Poulette', 'Couvée', 'Nid', 'Éclosion', 'Volaille', 'Caille', 'Pondue', 'Muesli', 'Coquille', 'Oeuf', 'Paille', 'Bec', 'Poussine', 'Oeufine', 'Cotcot', 'Caquet', 'Poulinette', 'Grattelle', 'Pioupiou', 'Poulette', 'Piaille', 'Picote', 'Becquée', 'Plume']

/**
 * Retrive a random name from the list of firstnames and lastnames
 * with a seed to make it deterministic
 * @param {string} seed
 * @returns
 */
export function getRandomFirstname(seed = `${Math.random()}`) {
  const numberFromSeed = Number.parseInt([...`${seed}`].reduce((acc, char) => acc + char.codePointAt(0), 0), 10)
  const firstname = FIRSTNAMES[numberFromSeed % FIRSTNAMES.length]
  return firstname
}

export function getRandomLastname(seed = `${Math.random()}`) {
  const numberFromSeed = Number.parseInt([...`${seed}`].reduce((acc, char) => acc + char.codePointAt(0), 0), 10)
  const lastname = LASTNAMES[numberFromSeed % LASTNAMES.length]
  return lastname
}
