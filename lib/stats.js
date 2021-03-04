const {getYesterdayRange, getLastWeekRange, getLastMonthRange, getLastYearRange, getAllTimeRange} = require('./dates')
const mongo = require('./mongo')

async function countCoworkersRange(range) {
  const result = await mongo.db.collection('users').aggregate([
    {$unwind: '$profile.presences'},
    {$match: {$and: [
      {'profile.presences.date': {$gte: range[0]}},
      {'profile.presences.date': {$lte: range[1]}}
    ]}},
    {$group: {_id: '$_id'}},
    {$group: {_id: 1, count: {$sum: 1}}}
  ]).toArray()

  return result[0].count
}

async function countCoworkedDaysRange(range) {
  const result = await mongo.db.collection('users').aggregate([
    {$unwind: '$profile.presences'},
    {$match: {$and: [
      {'profile.presences.date': {$gte: range[0]}},
      {'profile.presences.date': {$lte: range[1]}}
    ]}},
    {$group: {_id: 1, count: {$sum: '$profile.presences.amount'}}}
  ]).toArray()

  return result[0].count
}

async function computeStats() {
  const today = new Date()
  const yesterdayRange = getYesterdayRange(today)
  const lastWeekRange = getLastWeekRange(today)
  const lastMonthRange = getLastMonthRange(today)
  const lastYearRange = getLastYearRange(today)
  const allTimeRange = getAllTimeRange(today)

  return {
    nb_coworkers_veille: await countCoworkersRange(yesterdayRange),

    nb_coworkers_semaine_precedente: await countCoworkersRange(lastWeekRange),
    nb_coworkers_mois_precedent: await countCoworkersRange(lastMonthRange),
    nb_coworkers_annee_precedente: await countCoworkersRange(lastYearRange),

    nb_jours_coworkes_semaine_precedente: await countCoworkedDaysRange(lastWeekRange),
    nb_jours_coworkes_mois_precedent: await countCoworkedDaysRange(lastMonthRange),
    nb_jours_coworkes_annee_precedente: await countCoworkedDaysRange(lastYearRange),

    nb_coworkers_debut: await mongo.db.collection('users').countDocuments(),
    nb_jours_coworkes_debut: await countCoworkedDaysRange(allTimeRange)
  }
}

module.exports = {computeStats}
