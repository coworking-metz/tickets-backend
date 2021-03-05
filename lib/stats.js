const bluebird = require('bluebird')
const {getDays, getYesterdayRange, getLastWeekRange, getLastMonthRange, getLastYearRange, getAllTimeRange, getWeeks, getMonths, getYears, formatDate} = require('./dates')
const mongo = require('./mongo')
const cache = require('./cache')

async function computePresenceStats(range) {
  const result = await mongo.db.collection('users').aggregate([
    {$unwind: '$profile.presences'},
    {$match: {$and: [
      {'profile.presences.date': {$gte: range[0]}},
      {'profile.presences.date': {$lte: range[1]}}
    ]}},
    {$group: {_id: 1, uniqueUsers: {$addToSet: '$_id'}, amount: {$sum: '$profile.presences.amount'}}}
  ]).toArray()

  if (result.length === 0) {
    return {
      coworkersCount: 0,
      coworkedDaysCount: 0
    }
  }

  return {
    coworkersCount: result[0].uniqueUsers.length,
    coworkedDaysCount: result[0].amount
  }
}

async function computeNewCoworkersStats(range) {
  const result = await mongo.db.collection('users').aggregate([
    {$unwind: '$profile.presences'},
    {$group: {_id: '$_id', firstCoworkedDay: {$min: '$profile.presences.date'}}},
    {$match: {$and: [
      {firstCoworkedDay: {$gte: range[0]}},
      {firstCoworkedDay: {$lte: range[1]}}
    ]}},
    {$group: {_id: 1, count: {$sum: 1}}}
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

async function computeRangeData(range) {
  const {coworkersCount, coworkedDaysCount} = await computePresenceStats(range)
  const {newCoworkersCount} = await computeNewCoworkersStats(range)

  return {coworkersCount, coworkedDaysCount, newCoworkersCount}
}

const periodsBuilders = {
  day: getDays,
  week: getWeeks,
  month: getMonths,
  year: getYears
}

async function computePeriodsStats(periodType, from, to) {
  const periods = periodsBuilders[periodType](from, to)
  const today = formatDate(new Date())

  return bluebird.map(periods, async range => {
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
      return {...cacheEntry, current: true}
    }

    cache.set(key, cacheEntry)
    console.log(`Calcul de la période ${key} OK`)

    return cacheEntry
  }, {concurrency: 8})
}

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

    nb_jours_coworkes_veille: yesterdayData.coworkedDaysCount,
    nb_jours_coworkes_semaine_precedente: lastWeekData.coworkedDaysCount,
    nb_jours_coworkes_mois_precedent: lastMonthData.coworkedDaysCount,
    nb_jours_coworkes_annee_precedente: lastYearData.coworkedDaysCount,
    nb_jours_coworkes_debut: allTimeData.coworkedDaysCount,

    nb_nvx_coworkers_mois_precedent: lastMonthData.newCoworkersCount,
    nb_nvx_coworkers_annee_precedente: lastYearData.newCoworkersCount
  }
}

module.exports = {computeStats, computePeriodsStats}
