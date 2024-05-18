import pMap from 'p-map'

import mongo from './util/mongo.js'
import cache from './util/cache.js'

import * as Member from './models/member.js'
import * as Activity from './models/activity.js'
import * as Subscription from './models/subscription.js'
import * as Ticket from './models/ticket.js'

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

import {computeSubcriptionEndDate, isPresenceDuringAbo} from './calc.js'
import {differenceInDays} from 'date-fns'

const CURRENT_TICKET_PRICE = 8

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

/**
 * How-to-compute-incomes-algorithm-draft
 *
 * For each day, get all subscriptions containing this day (stored them for later)
 * then get the price of each subscription, divide it by their period to get the daily price
 * then sum all the daily prices to get the total income for this day
 *
 * For each day, get all members presents (from their activity)
 * then filter the ones who have a matching subscription (in the subscriptions stored earlier)
 *
 * For each member remaining, we need to find what price their ticket was (if they have sufficient balance)
 * so fetch all their tickets orders, and remove all tickets that were used before this day.
 *
 * To do that, we need to get all member activity before this day (getMemberActivity)
 * and filter days where a ticket was used (type: 'ticket')
 * then progressively remove from ticketsOrders until all past tickets have been used
 * then we have the price of the ticket for this day
 **/
export async function computePeriodIncomes(periodType, from, to) {
  const periods = getPeriods(periodType, from, to)
  const incomeByPeriod = await Promise.all(periods.map(async ([started, ended]) => {
    const days = getDays(new Date(started), new Date(ended)).map(([day]) => day)

    const incomeByDay = await Promise.all(days.map(async day => {
      const membersActivity = await Activity.getActivityByDate(day)

      const activeSubscriptions = await Subscription.findActiveSubscriptionsByDate(day)
      const enhancedActiveSubscriptions = activeSubscriptions.map(subscription => {
        const endDate = computeSubcriptionEndDate(subscription.startDate)
        const periodInDays = differenceInDays(
          new Date(endDate),
          new Date(subscription.startDate)
        )
        const dailyAmount = subscription.price / periodInDays
        const wasMemberAttending = membersActivity.some(activity => activity.member === subscription.memberId)

        return {
          ...subscription,
          endDate,
          periodInDays,
          dailyAmount,
          wasMemberAttending
        }
      })

      // Remove members with subscription
      const ticketsActivity = membersActivity
        .filter(activity => !enhancedActiveSubscriptions.some(subscription => subscription.memberId === activity.member))

      // Compute for each tickets member its balance until this day
      const pricedTickets = await Promise.all(ticketsActivity.map(async ticketActivity => {
        const memberTicketsOrders = await Ticket.getMemberTicketsOrders(ticketActivity.member)
        const memberTicketsOrdersWithUnitPrice = memberTicketsOrders
          .map(order => ({
            ...order,
            unitPrice: order.price / order.ticketsQuantity
          }))
        const memberActivity = await Activity.getMemberActivity(ticketActivity.member)
        const pastTicketActivity = memberActivity.filter(activity => activity.type === 'ticket').filter(activity => activity.date < day)

        // Check if balance was at least 0
        const totalQuantity = memberTicketsOrders.reduce((acc, {ticketsQuantity}) => acc + ticketsQuantity, 0)
        const pastTotalUsed = pastTicketActivity.reduce((acc, {value}) => acc + value, 0)

        if (totalQuantity <= pastTotalUsed) {
          // Ticket has been consumed but couldn't be paid. It should be marked as debt
          return {
            ...ticketActivity,
            debt: CURRENT_TICKET_PRICE * ticketActivity.value
          }
        }

        for (const pastActivity of pastTicketActivity) {
          for (const ticketsOrder of memberTicketsOrdersWithUnitPrice) {
            if (ticketsOrder.ticketsQuantity > 0) {
              if (ticketsOrder.ticketsQuantity - pastActivity.value < 0) {
                pastActivity.value -= ticketsOrder.ticketsQuantity
                ticketsOrder.ticketsQuantity = 0
              } else {
                ticketsOrder.ticketsQuantity -= pastActivity.value
                break
              }
            }
          }
        }

        const firstTicketsOrderWithRemainingQuantity = memberTicketsOrdersWithUnitPrice
          .find(({ticketsQuantity}) => ticketsQuantity > 0)

        return {
          ...ticketActivity,
          amount: firstTicketsOrderWithRemainingQuantity.unitPrice * ticketActivity.value
        }
      }))

      return {
        date: day,
        subscriptions: enhancedActiveSubscriptions,
        tickets: pricedTickets
      }
    }))

    // eslint-disable-next-line unicorn/no-array-reduce
    const {tickets, subscriptions} = incomeByDay.reduce((acc, day) => {
      const {subscriptions, tickets} = day

      // eslint-disable-next-line unicorn/no-array-reduce
      const ticketsSummary = tickets.reduce((acc, ticket) => {
        if (ticket.debt) {
          return {
            ...acc,
            debt: {
              count: acc.debt.count + ticket.value,
              amount: acc.debt.amount + ticket.debt
            }
          }
        }

        return {
          ...acc,
          count: acc.count + ticket.value,
          amount: acc.amount + (ticket.amount || 0)
        }
      }, {count: 0, amount: 0, debt: {count: 0, amount: 0}})

      // eslint-disable-next-line unicorn/no-array-reduce
      const subscriptionsSummary = subscriptions.reduce((acc, subscription) => ({
        count: acc.count + 1,
        amount: acc.amount + subscription.dailyAmount,
        attending: acc.attending + Number(subscription.wasMemberAttending)
      }), {count: 0, amount: 0, attending: 0})

      return {
        tickets: {
          count: acc.tickets.count + ticketsSummary.count,
          amount: acc.tickets.amount + ticketsSummary.amount,
          debt: {
            count: acc.tickets.debt.count + ticketsSummary.debt.count,
            amount: acc.tickets.debt.amount + ticketsSummary.debt.amount
          }
        },
        subscriptions: {
          count: acc.subscriptions.count + subscriptionsSummary.count,
          amount: acc.subscriptions.amount + subscriptionsSummary.amount,
          attending: acc.subscriptions.attending + subscriptionsSummary.attending
        }
      }
    }, {
      tickets: {
        count: 0,
        amount: 0,
        debt: {
          count: 0,
          amount: 0
        }
      },
      subscriptions: {
        count: 0,
        amount: 0,
        attending: 0
      }
    })

    return {
      date: started,
      type: periodType,
      data: {
        tickets,
        subscriptions
      }
    }
  }))

  return incomeByPeriod
}

export const PERIODS_TYPES = new Set(['day', 'week', 'month', 'year'])

export async function precomputeStats() {
  await Promise.all([...PERIODS_TYPES].map(periodType => computePeriodsStats(periodType)))
}
