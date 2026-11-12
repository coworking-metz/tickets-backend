import pMap from 'p-map'
import {groupBy, sumBy} from 'lodash-es'

import mongo from './util/mongo.js'

import * as Member from './models/member.js'
import * as Activity from './models/activity.js'
import * as Subscription from './models/subscription.js'
import * as Ticket from './models/ticket.js'
import * as Membership from './models/membership.js'

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
import {differenceInDays} from 'date-fns'

/**
 * Activity of a single member over some periods. Pure.
 *
 * @param {Object} data
 * @param {Array} data.activities Member raw activities within the periods.
 * @param {string} [data.firstActivityDate] First day the member has ever coworked.
 * @param {Map<string, number>} data.dayToPeriodIndex Period index of each day.
 * @returns {Map<number, {count: number, amount: number, isNew: boolean}>} contribution by period index.
 */
export function computeMemberActivity({activities, firstActivityDate, dayToPeriodIndex}) {
  const activityByPeriod = new Map()
  const getPeriodActivity = index => {
    if (!activityByPeriod.has(index)) {
      activityByPeriod.set(index, {count: 0, amount: 0, isNew: false})
    }

    return activityByPeriod.get(index)
  }

  for (const activity of activities) {
    const index = dayToPeriodIndex.get(activity.date)
    if (index !== undefined) {
      const periodActivity = getPeriodActivity(index)
      periodActivity.count += 1
      periodActivity.amount += activity.value ?? 0
    }
  }

  const firstActivityIndex = firstActivityDate && dayToPeriodIndex.get(firstActivityDate)
  if (firstActivityIndex !== undefined) {
    getPeriodActivity(firstActivityIndex).isNew = true
  }

  return activityByPeriod
}

/**
 * Activity stats of each given range (non overlapping), with a constant number of queries.
 *
 * @param {Array<[string, string]>} ranges
 * @returns {Promise<Array<{coworkersCount, coworkedDaysCount, newCoworkersCount, coworkedDaysAmount}>>} by range.
 */
export async function computeRangesActivity(ranges) {
  if (ranges.length === 0) {
    return []
  }

  const dayToPeriodIndex = new Map()
  for (const [index, [started, ended]] of ranges.entries()) {
    for (const [day] of getDays(new Date(started), new Date(ended))) {
      dayToPeriodIndex.set(day, index)
    }
  }

  const rangeStart = ranges.map(([started]) => started).sort()[0]
  const rangeEnd = ranges.map(([, ended]) => ended).sort().at(-1)

  const [activities, newCoworkers] = await Promise.all([
    mongo.db.collection('member_activity')
      .find({date: {$gte: rangeStart, $lte: rangeEnd}}, {projection: {member: 1, date: 1, value: 1}})
      .toArray(),
    mongo.db.collection('member_activity').aggregate([
      {$group: {_id: '$member', firstCoworkedDay: {$min: '$date'}}},
      {$match: {firstCoworkedDay: {$gte: rangeStart, $lte: rangeEnd}}}
    ]).toArray()
  ])

  const activitiesByMember = groupBy(activities, 'member')
  const firstActivityDateByMember = new Map(newCoworkers.map(({_id, firstCoworkedDay}) => [_id, firstCoworkedDay]))
  const memberIds = new Set([...Object.keys(activitiesByMember), ...firstActivityDateByMember.keys()])

  const rangesActivity = ranges.map(() => ({
    coworkersCount: 0,
    coworkedDaysCount: 0,
    newCoworkersCount: 0,
    coworkedDaysAmount: 0
  }))

  for (const memberId of memberIds) {
    const memberActivity = computeMemberActivity({
      activities: activitiesByMember[memberId] ?? [],
      firstActivityDate: firstActivityDateByMember.get(memberId),
      dayToPeriodIndex
    })

    for (const [index, {count, amount, isNew}] of memberActivity) {
      const rangeActivity = rangesActivity[index]
      if (count > 0) {
        rangeActivity.coworkersCount += 1
        rangeActivity.coworkedDaysCount += count
        rangeActivity.coworkedDaysAmount += amount
      }

      if (isNew) {
        rangeActivity.newCoworkersCount += 1
      }
    }
  }

  return rangesActivity
}

async function computeRangeData(range) {
  const [data] = await computeRangesActivity([range])
  return data
}

export async function computePeriodsStats(periodType, options = {}) {
  const {from, to, includesCurrent} = options
  const periods = getPeriods(periodType, from, to)
  const today = formatDate(new Date())
  const periodsData = await computeRangesActivity(periods)

  const stats = periods.map((range, index) => ({
    date: range[0],
    type: periodType,
    data: periodsData[index],
    ...((today === range[0] || today < range[1]) && {current: true})
  }))

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
        continue
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

const PERIODIC_CHARGES_IN_EUR = [
  {
    from: '2014-01-01',
    to: '2014-12-31',
    amount: 3240.73
  },
  {
    from: '2015-01-01',
    to: '2015-12-31',
    amount: 9877.77
  },
  {
    from: '2016-01-01',
    to: '2016-12-31',
    amount: 9877.77
  },
  {
    from: '2017-01-01',
    to: '2017-12-31',
    amount: 9795.03
  },
  {
    from: '2018-01-01',
    to: '2018-12-31',
    amount: 10_772.51
  },
  {
    from: '2019-01-01',
    to: '2019-12-31',
    amount: 12_052.23
  },
  {
    from: '2020-01-01',
    to: '2020-12-31',
    amount: 19_022.58
  },
  {
    from: '2021-01-01',
    to: '2021-12-31',
    amount: 18_509.5
  },
  {
    from: '2022-01-01',
    to: '2022-12-31',
    amount: 18_769.51
  },
  {
    from: '2023-01-01',
    to: '2023-12-31',
    amount: 1761.73 * 12
  },
  {
    from: '2024-01-01',
    to: '2024-08-31',
    items: [
      {label: 'poulaillerRent', amount: 1645.3 * 8},
      {label: 'insurance', amount: 208.35 / 12 * 8},
      {label: 'internet', amount: 60 * 8},
      {label: 'transactionFees', amount: 700 / 12 * 8},
      {label: 'bankFees', amount: 100 / 12 * 8},
      {label: 'other', amount: 2000 / 12 * 8}
    ]
  },
  {
    from: '2024-09-01',
    to: '2024-12-31',
    items: [
      {label: 'poulaillerRent', amount: 1645.3 * 4},
      {label: 'ptiPoulaillerRent', amount: 901.72 * 4},
      {label: 'insurance', amount: 208.35 / 12 * 4},
      {label: 'internet', amount: 60 * 4},
      {label: 'transactionFees', amount: 700 / 12 * 4},
      {label: 'bankFees', amount: 100 / 12 * 4},
      {label: 'other', amount: 2000 / 12 * 4}
    ]
  },
  {
    from: '2025-01-01',
    to: '2025-12-31',
    items: [
      {label: 'poulaillerRent', amount: 1645.3 * 12},
      {label: 'ptiPoulaillerRent', amount: 901.72 * 12},
      {label: 'insurance', amount: 208.35},
      {label: 'internet', amount: 60 * 12},
      {label: 'transactionFees', amount: 700},
      {label: 'bankFees', amount: 100},
      {label: 'other', amount: 2000}
    ]
  },
  {
    from: '2026-01-01',
    to: '2026-12-31',
    items: [
      {label: 'poulaillerRent', amount: 1645.3 * 12},
      {label: 'ptiPoulaillerRent', amount: 901.72 * 12},
      {label: 'insurance', amount: 804.06},
      {label: 'internet', amount: 60 * 12},
      {label: 'transactionFees', amount: 700},
      {label: 'bankFees', amount: 100},
      {label: 'other', amount: 2000}
    ]
  }
]

/**
 * Usage = how much each day of presence is worth:
 * - a day covered by a subscription is worth the subscription daily price (counted even when absent),
 * - otherwise it is worth the price of the tickets consumed that day (FIFO, see computeActivityCoverage()),
 *   or a debt when no ticket was left.
 *
 * Computation is done per member (computeMemberDailyUsage(), pure) on data loaded in bulk,
 * then aggregated per period, so that the number of queries does not depend on the range size.
 */
export async function computePeriodUsage(periodType, from, to) {
  const {periods, periodsDays, rangeStart, rangeEnd, dayToPeriodIndex} = buildPeriodsIndex(periodType, from, to)
  if (periods.length === 0) {
    return []
  }

  const [activities, subscriptions] = await Promise.all([
    Activity.getActivityBetween(rangeStart, rangeEnd),
    Subscription.findSubscriptionsOverlapping(rangeStart, rangeEnd)
  ])

  const activitiesByMember = groupBy(activities, 'member')
  const subscriptionsByMember = groupBy(subscriptions, 'memberId')
  const memberIds = [...new Set([...Object.keys(activitiesByMember), ...Object.keys(subscriptionsByMember)])]

  // Only days paid with tickets need the activity coverage
  const ticketsDatesByMember = new Map()
  for (const memberId of memberIds) {
    const ticketsDates = getTicketsActivityDates(activitiesByMember[memberId] ?? [], subscriptionsByMember[memberId] ?? [])
    if (ticketsDates.length > 0) {
      ticketsDatesByMember.set(memberId, ticketsDates)
    }
  }

  const [coverageByMember, membersById] = await Promise.all([
    getMembersCoverageByDate([...ticketsDatesByMember.keys()]),
    Member.computeMembersByIds(memberIds)
  ])

  const periodsUsage = periods.map(() => ({
    tickets: initializeTicketsSummary(),
    subscriptions: initializeSubscriptionsSummary(),
    members: new Map()
  }))

  for (const memberId of memberIds) {
    const dailyUsage = computeMemberDailyUsage({
      from: rangeStart,
      to: rangeEnd,
      activities: activitiesByMember[memberId] ?? [],
      subscriptions: subscriptionsByMember[memberId] ?? [],
      coverageByDate: coverageByMember.get(memberId)
    })

    for (const dayUsage of dailyUsage) {
      const periodUsage = periodsUsage[dayToPeriodIndex.get(dayUsage.date)]
      if (!periodUsage) {
        continue
      }

      if (!periodUsage.members.has(memberId)) {
        periodUsage.members.set(memberId, {
          tickets: initializeTicketsSummary(),
          subscriptions: initializeSubscriptionsSummary()
        })
      }

      addDayUsage(periodUsage, dayUsage)
      addDayUsage(periodUsage.members.get(memberId), dayUsage)
    }
  }

  return periods.map(([started], index) => {
    const {tickets, subscriptions, members} = periodsUsage[index]
    const periodMembers = []
    for (const [memberId, usage] of members) {
      const member = membersById.get(memberId)
      if (member) {
        periodMembers.push({...member, usage: formatUsageSummary(usage)})
      }
    }

    return {
      date: started,
      type: periodType,
      data: {
        charges: sumBy(periodsDays[index], day => getDailyCharges(day)),
        ...formatUsageSummary({tickets, subscriptions}),
        members: periodMembers
      }
    }
  })
}

/**
 * Periods of the given type, their days and an index to find the period of a day in O(1).
 */
const buildPeriodsIndex = (periodType, from, to) => {
  const periods = getPeriods(periodType, from, to)
  const periodsDays = periods.map(([started, ended]) => getDays(new Date(started), new Date(ended)).map(([day]) => day))
  const dayToPeriodIndex = new Map()
  for (const [index, days] of periodsDays.entries()) {
    for (const day of days) {
      dayToPeriodIndex.set(day, index)
    }
  }

  return {
    periods,
    periodsDays,
    rangeStart: periodsDays[0]?.[0],
    rangeEnd: periodsDays.at(-1)?.at(-1),
    dayToPeriodIndex
  }
}

const nextDay = day => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

const isCoveredBySubscription = (day, subscriptions) =>
  subscriptions.some(subscription => subscription.started <= day && day <= subscription.ended)

/**
 * Dates of the given activities which are not covered by any of the given subscriptions.
 */
export const getTicketsActivityDates = (activities, subscriptions) =>
  activities
    .filter(activity => !isCoveredBySubscription(activity.date, subscriptions))
    .map(activity => activity.date)

/**
 * Activity coverage by date of each given member, computed in bulk.
 *
 * @param {string[]} memberIds
 * @returns {Promise<Map<string, Map<string, Object>>>}
 */
const getMembersCoverageByDate = async memberIds => {
  const coverageByMember = await Member.computeMembersActivityCoverage(memberIds)
  return new Map([...coverageByMember].map(([memberId, coverage]) => [
    memberId,
    new Map(coverage.map(activity => [activity.date, activity]))
  ]))
}

/**
 * Daily usage of a single member between two dates (included). Pure.
 *
 * @param {Object} data
 * @param {string} data.from First day (YYYY-MM-DD).
 * @param {string} data.to Last day (YYYY-MM-DD).
 * @param {Array} data.activities Member activities between these days, with their effective value.
 * @param {Array} data.subscriptions Member formatted subscriptions overlapping these days.
 * @param {Map<string, Object>} [data.coverageByDate] Member activity coverage by date, for days paid with tickets.
 * @returns {Array<{date: string, ticketsActivity: Object|null, subscriptions: Array}>} sorted by date.
 */
export function computeMemberDailyUsage({from, to, activities, subscriptions, coverageByDate}) {
  const usageByDate = new Map()
  const getDayUsage = date => {
    if (!usageByDate.has(date)) {
      usageByDate.set(date, {date, ticketsActivity: null, subscriptions: []})
    }

    return usageByDate.get(date)
  }

  const attendingDurationByDate = new Map(activities.map(activity => [activity.date, activity.value]))

  for (const subscription of subscriptions) {
    const lastDay = subscription.ended < to ? subscription.ended : to
    for (let day = subscription.started > from ? subscription.started : from; day <= lastDay; day = nextDay(day)) {
      getDayUsage(day).subscriptions.push({
        ...subscription,
        attendingDuration: attendingDurationByDate.get(day) ?? 0
      })
    }
  }

  for (const activity of activities) {
    if (isCoveredBySubscription(activity.date, subscriptions)) {
      continue
    }

    const ticketsActivity = coverageByDate?.get(activity.date)
    if (ticketsActivity) {
      getDayUsage(activity.date).ticketsActivity = ticketsActivity
    }
  }

  return [...usageByDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const addDayUsage = (summary, dayUsage) => {
  if (dayUsage.ticketsActivity) {
    addSummaryTicket(summary.tickets, dayUsage.ticketsActivity)
  }

  for (const subscription of dayUsage.subscriptions) {
    addSummarySubscription(summary.subscriptions, subscription)
  }
}

const formatUsageSummary = ({tickets, subscriptions}) => ({
  amount: tickets.amount + subscriptions.amount,
  tickets: {...tickets, byPrice: sortByPrice(tickets.byPrice)},
  subscriptions: {...subscriptions, byPrice: sortByPrice(subscriptions.byPrice)}
})

/**
 * Mutate the given breakdown to add some count and amount at the given unit price.
 */
const addToPriceBreakdown = (byPrice, price, count, amount) => {
  const existing = byPrice.find(b => b.price.toFixed(2) === price.toFixed(2))
  if (existing) {
    existing.count += count
    existing.amount += amount
  } else {
    byPrice.push({price, count, amount})
  }
}

const sortByPrice = byPrice => byPrice.sort((a, b) => a.price - b.price)

const initializeTicketsSummary = () => ({count: 0, amount: 0, byPrice: [], debt: {count: 0, amount: 0}})
const addSummaryTicket = (summary, ticketActivityWithCoverage) => {
  const {tickets, debt} = ticketActivityWithCoverage.coverage
  summary.count += tickets?.count ?? 0
  summary.amount += tickets?.amount ?? 0
  summary.debt.count += debt?.value ?? 0
  summary.debt.amount += debt?.amount ?? 0

  if (tickets?.byPrice) {
    for (const {price, count, amount} of tickets.byPrice) {
      addToPriceBreakdown(summary.byPrice, price, count, amount)
    }
  } else if (tickets?.count) {
    // Coverage computed before the breakdown by price existed: use the average price
    addToPriceBreakdown(summary.byPrice, tickets.amount / tickets.count, tickets.count, tickets.amount)
  }
}

const initializeSubscriptionsSummary = () => ({count: 0, amount: 0, byPrice: [], attending: {count: 0, amount: 0}})
const addSummarySubscription = (summary, subscription) => {
  summary.count += 1
  summary.amount += subscription.dailyAmount
  summary.attending.count += subscription.attendingDuration
  summary.attending.amount += subscription.attendingDuration * subscription.dailyAmount
  // Subscriptions are grouped by their full price, counted in days
  addToPriceBreakdown(summary.byPrice, subscription.amount, 1, subscription.dailyAmount)
}

/**
 * Income = what was purchased (tickets, subscriptions, memberships) during each period.
 *
 * Orders are loaded in bulk for the whole range, then aggregated per member (computeMemberIncome(), pure)
 * and per period, so that the number of queries does not depend on the range size.
 */
export async function computePeriodIncome(periodType, from, to) {
  const {periods, periodsDays, rangeStart, rangeEnd, dayToPeriodIndex} = buildPeriodsIndex(periodType, from, to)
  if (periods.length === 0) {
    return []
  }

  const [ticketsOrders, subscriptionsOrders, membershipsOrders] = await Promise.all([
    Ticket.getTicketsOrdersBetween(rangeStart, rangeEnd),
    Subscription.getSubscriptionsBetween(rangeStart, rangeEnd),
    Membership.getMembershipsBetween(rangeStart, rangeEnd)
  ])

  const periodsOrders = periods.map(() => ({ticketsOrders: [], subscriptionsOrders: [], membershipsOrders: []}))
  const bucket = (orders, type) => {
    for (const order of orders) {
      periodsOrders[dayToPeriodIndex.get(order.purchased)]?.[type].push(order)
    }
  }

  bucket(ticketsOrders, 'ticketsOrders')
  bucket(subscriptionsOrders, 'subscriptionsOrders')
  bucket(membershipsOrders, 'membershipsOrders')

  const memberIds = [...new Set([...ticketsOrders, ...subscriptionsOrders, ...membershipsOrders].map(order => order.memberId))]
  const membersById = await Member.computeMembersByIds(memberIds)

  return periods.map(([started], index) => {
    const orders = periodsOrders[index]
    const days = periodsDays[index]

    const ticketsByMember = groupBy(orders.ticketsOrders, 'memberId')
    const subscriptionsByMember = groupBy(orders.subscriptionsOrders, 'memberId')
    const membershipsByMember = groupBy(orders.membershipsOrders, 'memberId')
    const periodMemberIds = new Set([...Object.keys(ticketsByMember), ...Object.keys(subscriptionsByMember), ...Object.keys(membershipsByMember)])

    const periodMembers = []
    for (const memberId of periodMemberIds) {
      const member = membersById.get(memberId)
      if (member) {
        periodMembers.push({
          ...member,
          income: computeMemberIncome({
            ticketsOrders: ticketsByMember[memberId] ?? [],
            subscriptionsOrders: subscriptionsByMember[memberId] ?? [],
            membershipsOrders: membershipsByMember[memberId] ?? []
          })
        })
      }
    }

    const sumOrders = list => list.reduce((sum, order) => sum + order.amount, 0)
    const charges = sumBy(days, day => getDailyCharges(day))

    return {
      date: started,
      type: periodType,
      data: {
        income: sumOrders(orders.ticketsOrders) + sumOrders(orders.membershipsOrders) + sumOrders(orders.subscriptionsOrders),
        charges,
        chargesBreakdown: mergeChargesBreakdown(days.flatMap(day => getDailyChargesBreakdown(day))),
        tickets: {
          count: orders.ticketsOrders.reduce((sum, order) => sum + order.count, 0),
          amount: sumOrders(orders.ticketsOrders),
          byPrice: computeTicketsByPrice(orders.ticketsOrders)
        },
        memberships: {
          count: orders.membershipsOrders.length,
          amount: sumOrders(orders.membershipsOrders)
        },
        subscriptions: {
          count: orders.subscriptionsOrders.length,
          amount: sumOrders(orders.subscriptionsOrders),
          byPrice: computeSubscriptionsByPrice(orders.subscriptionsOrders)
        },
        members: periodMembers
      }
    }
  })
}

/**
 * Income of a single member from its orders. Pure.
 */
export function computeMemberIncome({ticketsOrders, subscriptionsOrders, membershipsOrders}) {
  const summarize = (orders, getCount) => ({
    count: sumBy(orders, getCount),
    amount: sumBy(orders, 'amount')
  })

  const tickets = summarize(ticketsOrders, 'count')
  const subscriptions = summarize(subscriptionsOrders, () => 1)
  const memberships = summarize(membershipsOrders, () => 1)

  return {
    tickets,
    subscriptions,
    memberships,
    amount: tickets.amount + subscriptions.amount + memberships.amount
  }
}

/**
 * Each order already carries its own amount and tickets quantity, so the unit
 * price (amount / count) is exact, not guessed. Group orders by that price.
 */
const computeTicketsByPrice = ticketsOrders => {
  const byPrice = {}
  for (const order of ticketsOrders) {
    if (!order.count) {
      continue
    }

    const price = order.amount / order.count
    const key = price.toFixed(2)
    if (!byPrice[key]) {
      byPrice[key] = {price, count: 0, amount: 0}
    }

    byPrice[key].count += order.count
    byPrice[key].amount += order.amount
  }

  return Object.values(byPrice).sort((a, b) => a.price - b.price)
}

/**
 * A subscription order is already a single unit (no quantity to divide by),
 * so its price is just its amount. Group orders by that amount.
 */
const computeSubscriptionsByPrice = subscriptionsOrders => {
  const byPrice = {}
  for (const order of subscriptionsOrders) {
    const price = order.amount
    const key = price.toFixed(2)
    if (!byPrice[key]) {
      byPrice[key] = {price, count: 0, amount: 0}
    }

    byPrice[key].count += 1
    byPrice[key].amount += order.amount
  }

  return Object.values(byPrice).sort((a, b) => a.price - b.price)
}

const mergeChargesBreakdown = items => {
  const byLabel = {}
  for (const {label, amount} of items) {
    byLabel[label] = (byLabel[label] ?? 0) + amount
  }

  return Object.entries(byLabel).map(([label, amount]) => ({label, amount}))
}

const getPeriodChargesItems = period => period.items || [{label: 'other', amount: period.amount}]

export const getDailyCharges = date => {
  const period = PERIODIC_CHARGES_IN_EUR.find(({from, to}) => date >= from && date <= to)
  if (!period) {
    return null
  }

  const durationInDays = differenceInDays(
    new Date(period.to),
    new Date(period.from)
  ) + 1

  const amount = period.items
    ? period.items.reduce((sum, item) => sum + item.amount, 0)
    : period.amount

  return amount / durationInDays
}

/**
 * Only periods from 2024-09 onwards have their charges itemized (rent,
 * insurance, internet, …). Earlier periods only have a historical lump sum,
 * which is returned as a single generic 'other' item.
 */
export const getDailyChargesBreakdown = date => {
  const period = PERIODIC_CHARGES_IN_EUR.find(({from, to}) => date >= from && date <= to)
  if (!period) {
    return []
  }

  const durationInDays = differenceInDays(
    new Date(period.to),
    new Date(period.from)
  ) + 1

  return getPeriodChargesItems(period).map(({label, amount}) => ({
    label,
    amount: amount / durationInDays
  }))
}

export async function computePeriodAttendance(periodType, from, to) {
  const {periods, periodsDays, rangeStart, rangeEnd} = buildPeriodsIndex(periodType, from, to)
  if (periods.length === 0) {
    return []
  }

  const activities = await Activity.getActivityBetween(rangeStart, rangeEnd)
  const datesByMember = new Map()
  for (const activity of activities) {
    datesByMember.set(activity.member, [...(datesByMember.get(activity.member) ?? []), activity.date])
  }

  const [coverageByMember, membersById] = await Promise.all([
    getMembersCoverageByDate([...datesByMember.keys()]),
    Member.computeMembersByIds([...datesByMember.keys()])
  ])
  const activitiesByDate = groupBy(activities, 'date')

  return periods.map(([started], index) => {
    const attendingMembersSet = {}
    for (const day of periodsDays[index]) {
      for (const {member: memberId} of activitiesByDate[day] ?? []) {
        const a = coverageByMember.get(memberId)?.get(day)
        if (!a) {
          continue
        }

        if (!attendingMembersSet[memberId]) {
          attendingMembersSet[memberId] = {
            tickets: [],
            subscriptions: []
          }
        }

        if (a.type === 'ticket') {
          attendingMembersSet[memberId].tickets.push(a)
        } else if (a.type === 'subscription') {
          attendingMembersSet[memberId].subscriptions.push(a)
        }
      }
    }

    const attendingMembers = Object.entries(attendingMembersSet).filter(([memberId]) => membersById.has(memberId)).map(([memberId, {tickets, subscriptions}]) => {
      const member = membersById.get(memberId)
      // eslint-disable-next-line unicorn/no-array-reduce
      const ticketsActivity = tickets.reduce((acc, activity) => ({
        count: acc.count + activity.value,
        amount: acc.amount + activity.amount,
        debt: {
          count: acc.debt.count + (activity.debt ? activity.debt.value : 0),
          amount: acc.debt.amount + (activity.debt ? activity.debt.amount : 0)
        }
      }), {count: 0, amount: 0, debt: {count: 0, amount: 0}})

      // eslint-disable-next-line unicorn/no-array-reduce
      const subscriptionActivity = subscriptions.reduce((acc, {value, amount}) => ({
        count: acc.count + value,
        amount: acc.amount + amount
      }), {count: 0, amount: 0})

      return {
        ...member,
        attendance: {
          tickets: ticketsActivity,
          subscriptions: subscriptionActivity
        }
      }
    })

    return {
      date: started,
      type: periodType,
      data: {
        members: attendingMembers
      }
    }
  })
}

export const PERIODS_TYPES = new Set(['day', 'week', 'month', 'year'])
