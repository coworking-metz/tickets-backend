import pMap from 'p-map'

import mongo from './util/mongo.js'
import cache from './util/cache.js'

import * as Member from './models/member.js'
import * as Activity from './models/activity.js'

import {
  getDays,
  getPeriods,
  getYesterdayRange,
  getLastWeekRange,
  getLastMonthRange,
  getLastYearRange,
  getAllTimeRange,
  formatDate
} from './dates.js'

import {isPresenceDuringAbo} from './calc.js'

async function computePresenceStats(range) {
  const result = await mongo.db.collection('member_activity').aggregate([
    {$match: {
      date: {$gte: range[0], $lte: range[1]}
    }},
    {$group: {
      _id: 1,
      uniqueUsers: {$addToSet: '$member'},
      presenceDays: {$sum: 1},
      presenceAmount: {$sum: '$value'}
    }}
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

async function computeNewCoworkersStats(range) {
  const result = await mongo.db.collection('member_activity').aggregate([
    {$group: {
      _id: '$member', firstCoworkedDay: {$min: '$date'}
    }},
    {$match: {
      firstCoworkedDay: {$gte: range[0], $lte: range[1]}
    }},
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
  const {coworkersCount, coworkedDaysCount, coworkedDaysAmount} = await computePresenceStats(range)
  const {newCoworkersCount} = await computeNewCoworkersStats(range)

  return {coworkersCount, coworkedDaysCount, newCoworkersCount, coworkedDaysAmount}
}

export async function computePeriodsStats(periodType, options = {}) {
  const {from, to, includesCurrent} = options
  const periods = getPeriods(periodType, from, to)
  const today = formatDate(new Date())

  const stats = await pMap(periods, async range => {
    const current = today === range[0] || today < range[1]
    const key = `${periodType}-${range[0]}`

    if (!current && await cache.has(key)) {
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

    await cache.set(key, cacheEntry)
    console.log(`Calcul de la période ${key} OK`)

    return cacheEntry
  }, {concurrency: 8})

  return includesCurrent
    ? stats
    : stats.filter(s => !s.current)
}

export function asCsv(row) {
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

export async function computeStats() {
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

export async function computeIncomes(periodType, from, to) {
  const users = await Member.getAllUsers()

  const datesIndex = {}

  await pMap(users, async user => {
    const memberActivity = await Activity.getMemberActivity(user._id)

    for (const activityEntry of memberActivity) {
      const {date, value} = activityEntry

      if (!datesIndex[date]) {
        datesIndex[date] = []
      }

      if (activityEntry.type === 'subscription') {
        return
      }

      datesIndex[date].push({
        user,
        date,
        amount: value
      })
    }
  }, {concurrency: 8})

  const periods = getPeriods(periodType, from, to)

  return periods.map(period => {
    const days = getDays(new Date(period[0]), new Date(period[1]))
    // eslint-disable-next-line unicorn/no-array-reduce
    const {usedTickets, daysAbo} = days.reduce((dataObj, dayPeriod) => {
      const day = dayPeriod[0]
      const dateEntries = datesIndex[day] || []
      const tickets = dateEntries.reduce(
        (ticketsSum, e) => ticketsSum + e.amount,
        0
      )
      const activeAbo = users.filter(u => isPresenceDuringAbo(day, u.profile.abos)).length
      dataObj.usedTickets += tickets
      dataObj.daysAbo += activeAbo
      return dataObj
    }, {usedTickets: 0, daysAbo: 0})

    return {
      date: period[0],
      type: periodType,
      data: {usedTickets, daysAbo, incomes: (6 * usedTickets) + (2 * daysAbo)}}
  })
}

export const PERIODS_TYPES = new Set(['day', 'week', 'month', 'year'])

export async function precomputeStats() {
  await Promise.all([...PERIODS_TYPES].map(periodType => computePeriodsStats(periodType)))
}
