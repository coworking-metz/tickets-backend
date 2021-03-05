const {getYesterdayRange, getLastWeekRange, getLastMonthRange, getLastYearRange, getAllTimeRange} = require('./dates')
const mongo = require('./mongo')

async function computeRangeData(range) {
  const result = await mongo.db.collection('users').aggregate([
    {$unwind: '$profile.presences'},
    {$match: {$and: [
      {'profile.presences.date': {$gte: range[0]}},
      {'profile.presences.date': {$lte: range[1]}}
    ]}},
    {$group: {_id: 1, uniqueUsers: {$addToSet: '$_id'}, amount: {$sum: '$profile.presences.amount'}}}
  ]).toArray()

  if (result.length === 0) {
    return
  }

  return {
    coworkersCount: result[0].uniqueUsers.length,
    coworkedDaysCount: result[0].amount
  }
}

async function computeStats() {
  const today = new Date()

  const yesterdayData = await computeRangeData(getYesterdayRange(today))
  const lastWeekData = await computeRangeData(getLastWeekRange(today))
  const lastMonthData = await computeRangeData(getLastMonthRange(today))
  const lastYearData = await computeRangeData(getLastYearRange(today))
  const allTimeData = await computeRangeData(getAllTimeRange(today))

  return {
    nb_coworkers_veille: yesterdayData?.coworkersCount || 0,
    nb_coworkers_semaine_precedente: lastWeekData?.coworkersCount || 0,
    nb_coworkers_mois_precedent: lastMonthData?.coworkersCount || 0,
    nb_coworkers_annee_precedente: lastYearData?.coworkersCount || 0,
    nb_coworkers_debut: allTimeData?.coworkersCount || 0,

    nb_jours_coworkes_veille: yesterdayData?.coworkedDaysCount || 0,
    nb_jours_coworkes_semaine_precedente: lastWeekData?.coworkedDaysCount || 0,
    nb_jours_coworkes_mois_precedent: lastMonthData?.coworkedDaysCount || 0,
    nb_jours_coworkes_annee_precedente: lastYearData?.coworkedDaysCount || 0,
    nb_jours_coworkes_debut: allTimeData?.coworkedDaysCount || 0
  }
}

module.exports = {computeStats}
