// Importation du package 'bluebird' pour la gestion des promesses
const bluebird = require('bluebird')
// Importation des fonctions de gestion de dates à partir du module 'dates'
const { getPeriods, getYesterdayRange, getLastWeekRange, getLastMonthRange, getLastYearRange, getAllTimeRange, formatDate } = require('./dates')
// Importation du module 'mongo' pour la gestion de la base de données MongoDB
const mongo = require('./util/mongo')
// Importation du module 'cache' pour la mise en cache des données
const cache = require('./cache')
/**
 * Calcule les statistiques de présence sur une période donnée.
 * @param {Array} range - La plage de temps pour laquelle calculer les statistiques.
 * @returns {Object} Les statistiques de présence calculées.
 */
async function computePresenceStats(range) {
  const result = await mongo.db.collection('users').aggregate([
    { $unwind: '$profile.presences' },
    {
      $match: {
        $and: [
          { 'profile.presences.date': { $gte: range[0] } },
          { 'profile.presences.date': { $lte: range[1] } }
        ]
      }
    },
    {
      $group: {
        _id: 1,
        uniqueUsers: { $addToSet: '$_id' },
        presenceDays: { $sum: 1 },
        presenceAmount: { $sum: '$profile.presences.amount' }
      }
    }
  ]).toArray()

  if (result.length === 0) {
    return {
      coworkersCount: 0,
      coworkedDaysCount: 0,
      coworkedDaysAmount: 0
    }
  }

  return {
    coworkersCount: result[0].uniqueUsers.length,
    coworkedDaysCount: result[0].presenceDays,
    coworkedDaysAmount: result[0].presenceAmount
  }
}
/**
 * Calcule les statistiques des nouveaux collaborateurs sur une période donnée.
 * @param {Array} range - La plage de temps pour laquelle calculer les statistiques.
 * @returns {Object} Les statistiques des nouveaux collaborateurs calculées.
 */
async function computeNewCoworkersStats(range) {
  const result = await mongo.db.collection('users').aggregate([
    { $unwind: '$profile.presences' },
    { $group: { _id: '$_id', firstCoworkedDay: { $min: '$profile.presences.date' } } },
    {
      $match: {
        $and: [
          { firstCoworkedDay: { $gte: range[0] } },
          { firstCoworkedDay: { $lte: range[1] } }
        ]
      }
    },
    { $group: { _id: 1, count: { $sum: 1 } } }
  ]).toArray()

  if (result.length === 0) {
    return {
      newCoworkersCount: 0
    }
  }

  return {
    newCoworkersCount: result[0].count
  }
}
/**
 * Calcule les données sur une période donnée.
 * @param {Array} range - La plage de temps pour laquelle calculer les statistiques.
 * @returns {Object} Les données calculées pour la plage de temps.
 */
async function computeRangeData(range) {
  const { coworkersCount, coworkedDaysCount, coworkedDaysAmount } = await computePresenceStats(range)
  const { newCoworkersCount } = await computeNewCoworkersStats(range)

  return { coworkersCount, coworkedDaysCount, newCoworkersCount, coworkedDaysAmount }
}
/**
 * Calcule les statistiques pour des périodes spécifiques.
 * @param {string} periodType - Le type de période (par exemple, jour, semaine, mois).
 * @param {Object} options - Les options pour le calcul.
 * @returns {Array} Les statistiques pour chaque période.
 */
async function computePeriodsStats(periodType, options = {}) {
  const { from, to, includesCurrent } = options
  const periods = getPeriods(periodType, from, to)
  const today = formatDate(new Date())

  const stats = bluebird.map(periods, async range => {
    const current = today === range[0] || today < range[1]
    const key = `${periodType}-${range[0]}`

    if (!current && cache.has(key)) {
      return cache.get(key)
    }

    const data = await computeRangeData(range)

    const cacheEntry = {
      date: range[0],
      type: periodType,
      data
    }

    if (current) {
      return { ...cacheEntry, current: true }
    }

    cache.set(key, cacheEntry)
    console.log(`Calcul de la période ${key} OK`)

    return cacheEntry
  }, { concurrency: 8 })

  return includesCurrent
    ? stats
    : stats.filter(s => !s.current)
}

/**
 * Transforme une ligne de données en format CSV.
 * @param {Object} row - La ligne de données à transformer.
 * @returns {Object} Les données au format CSV.
 */
function asCsv(row) {
  return {
    date: row.date,
    type: row.type,
    current: row.current ? '1' : '',
    coworkers_count: row.data.coworkersCount,
    coworked_days_count: row.data.coworkedDaysCount,
    coworker_days_amount: row.data.coworkedDaysAmount,
    new_coworkers_count: row.data.newCoworkersCount
  }
}
/**
 * Calcule les statistiques pour différentes plages de temps.
 * @returns {Object} Les statistiques calculées.
 */
async function computeStats() {
  const today = new Date()

  const yesterdayData = await computeRangeData(getYesterdayRange(today))
  const lastWeekData = await computeRangeData(getLastWeekRange(today))
  const lastMonthData = await computeRangeData(getLastMonthRange(today))
  const lastYearData = await computeRangeData(getLastYearRange(today))
  const allTimeData = await computeRangeData(getAllTimeRange(today))

  return {
    nb_coworkers_veille: yesterdayData.coworkersCount,
    nb_coworkers_semaine_precedente: lastWeekData.coworkersCount,
    nb_coworkers_mois_precedent: lastMonthData.coworkersCount,
    nb_coworkers_annee_precedente: lastYearData.coworkersCount,
    nb_coworkers_debut: allTimeData.coworkersCount,

    nb_jours_presence_veille: yesterdayData.coworkedDaysCount,
    nb_jours_presence_semaine_precedente: lastWeekData.coworkedDaysCount,
    nb_jours_presence_mois_precedent: lastMonthData.coworkedDaysCount,
    nb_jours_presence_annee_precedente: lastYearData.coworkedDaysCount,
    nb_jours_presence_debut: allTimeData.coworkedDaysCount,

    nb_jours_coworkes_veille: yesterdayData.coworkedDaysAmount,
    nb_jours_coworkes_semaine_precedente: lastWeekData.coworkedDaysAmount,
    nb_jours_coworkes_mois_precedent: lastMonthData.coworkedDaysAmount,
    nb_jours_coworkes_annee_precedente: lastYearData.coworkedDaysAmount,
    nb_jours_coworkes_debut: allTimeData.coworkedDaysAmount,

    nb_nvx_coworkers_mois_precedent: lastMonthData.newCoworkersCount,
    nb_nvx_coworkers_annee_precedente: lastYearData.newCoworkersCount
  }
}

module.exports = { computeStats, computePeriodsStats, asCsv }
