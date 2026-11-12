import test from 'ava'

import {computeActivityCoverage} from '../models/member.js'
import {
  computeMemberActivity,
  computeMemberDailyUsage,
  computeMemberIncome,
  getTicketsActivityDates
} from '../stats.js'

const subscription = (started, ended, amount, durationInDays) => ({
  _id: `${started}-${ended}`,
  memberId: 'member',
  started,
  ended,
  durationInDays,
  purchased: started,
  amount,
  dailyAmount: amount / durationInDays
})

const ticketsOrder = (purchased, count, amount) => ({
  _id: `${purchased}-${count}`,
  memberId: 'member',
  purchased,
  count,
  amount,
  unitAmount: amount / count
})

/* Coverage: computeActivityCoverage() */

test('coverage / consumes tickets FIFO and keeps track of each unit price', t => {
  const coverage = computeActivityCoverage({
    rawActivity: [
      {date: '2025-01-03', value: 1},
      {date: '2025-01-02', value: 1},
      {date: '2025-01-04', value: 0.5}
    ],
    subscriptions: [],
    ticketsOrders: [
      ticketsOrder('2024-12-15', 1, 10), // Bought last: consumed last
      ticketsOrder('2024-12-01', 1, 8)
    ]
  })

  t.deepEqual(coverage.map(a => a.date), ['2025-01-02', '2025-01-03', '2025-01-04'])
  t.deepEqual(coverage[0].coverage.tickets, {count: 1, amount: 8, byPrice: [{price: 8, count: 1, amount: 8}]})
  t.is(coverage[0].coverage.debt, null)
  t.deepEqual(coverage[1].coverage.tickets, {count: 1, amount: 10, byPrice: [{price: 10, count: 1, amount: 10}]})
  // No ticket left: the half day becomes a debt
  t.deepEqual(coverage[2].coverage.tickets, {count: 0, amount: 0, byPrice: []})
  t.deepEqual(coverage[2].coverage.debt, {value: 0.5, amount: 4})
})

test('coverage / a single day can be paid with tickets at different prices', t => {
  const [day] = computeActivityCoverage({
    rawActivity: [{date: '2025-01-02', value: 1}],
    subscriptions: [],
    ticketsOrders: [
      ticketsOrder('2024-12-01', 0.5, 4),
      ticketsOrder('2024-12-02', 2, 20)
    ]
  })

  t.deepEqual(day.coverage.tickets, {
    count: 1,
    amount: 9,
    byPrice: [
      {price: 8, count: 0.5, amount: 4},
      {price: 10, count: 0.5, amount: 5}
    ]
  })
})

test('coverage / days within a subscription (bounds included) do not consume tickets', t => {
  const orders = [ticketsOrder('2024-12-01', 1, 8)]
  const coverage = computeActivityCoverage({
    rawActivity: [
      {date: '2025-01-01', value: 1},
      {date: '2025-01-31', value: 1},
      {date: '2025-02-01', value: 1}
    ],
    subscriptions: [subscription('2025-01-01', '2025-01-31', 62, 31)],
    ticketsOrders: orders
  })

  t.deepEqual(coverage.map(a => a.type), ['subscription', 'subscription', 'ticket'])
  t.deepEqual(coverage[2].coverage.tickets.byPrice, [{price: 8, count: 1, amount: 8}])
  // The given orders are not mutated by the consumption
  t.is(orders.length, 1)
  t.is(orders[0].count, 1)
})

/* Tickets dates: getTicketsActivityDates() */

test('tickets activity dates / excludes days covered by a subscription', t => {
  const dates = getTicketsActivityDates(
    [{date: '2025-01-10'}, {date: '2025-02-10'}],
    [subscription('2025-01-01', '2025-01-31', 62, 31)]
  )

  t.deepEqual(dates, ['2025-02-10'])
})

/* Daily usage: computeMemberDailyUsage() */

test('daily usage / counts every subscribed day within the range, attended or not', t => {
  const usage = computeMemberDailyUsage({
    from: '2025-01-30',
    to: '2025-02-02',
    activities: [{date: '2025-01-31', value: 0.5}],
    subscriptions: [subscription('2025-01-01', '2025-01-31', 62, 31)]
  })

  t.deepEqual(usage.map(day => day.date), ['2025-01-30', '2025-01-31'])
  t.is(usage[0].subscriptions[0].attendingDuration, 0)
  t.is(usage[1].subscriptions[0].attendingDuration, 0.5)
  t.is(usage[1].subscriptions[0].dailyAmount, 2)
  t.is(usage[1].ticketsActivity, null)
})

test('daily usage / days outside subscriptions use the tickets coverage', t => {
  const ticketsActivity = {type: 'ticket', date: '2025-02-01', value: 1, coverage: {tickets: {count: 1, amount: 8}}}
  const usage = computeMemberDailyUsage({
    from: '2025-01-31',
    to: '2025-02-03',
    activities: [{date: '2025-01-31', value: 1}, {date: '2025-02-01', value: 1}, {date: '2025-02-02', value: 1}],
    subscriptions: [subscription('2025-01-01', '2025-01-31', 62, 31)],
    // 2025-02-02 has no coverage (e.g. outdated cache): it is skipped
    coverageByDate: new Map([['2025-02-01', ticketsActivity]])
  })

  t.deepEqual(usage.map(day => day.date), ['2025-01-31', '2025-02-01'])
  t.is(usage[1].ticketsActivity, ticketsActivity)
  t.deepEqual(usage[1].subscriptions, [])
})

test('daily usage / overlapping subscriptions are all counted', t => {
  const usage = computeMemberDailyUsage({
    from: '2025-01-31',
    to: '2025-01-31',
    activities: [],
    subscriptions: [
      subscription('2025-01-01', '2025-01-31', 62, 31),
      subscription('2025-01-31', '2025-03-01', 60, 30)
    ]
  })

  t.is(usage.length, 1)
  t.is(usage[0].subscriptions.length, 2)
})

/* Income: computeMemberIncome() */

test('income / sums each kind of orders', t => {
  t.deepEqual(computeMemberIncome({
    ticketsOrders: [{count: 10, amount: 80}, {count: 1, amount: 10}],
    subscriptionsOrders: [{amount: 60}],
    membershipsOrders: [{amount: 15}]
  }), {
    tickets: {count: 11, amount: 90},
    subscriptions: {count: 1, amount: 60},
    memberships: {count: 1, amount: 15},
    amount: 165
  })
})

/* Activity: computeMemberActivity() */

const dayToPeriodIndex = new Map([
  ['2025-01-01', 0],
  ['2025-01-02', 0],
  ['2025-01-03', 1]
])

test('activity / counts days and sums values by period, ignoring days outside', t => {
  const activity = computeMemberActivity({
    activities: [
      {date: '2025-01-01', value: 1},
      {date: '2025-01-02', value: 0.5},
      {date: '2025-01-03', value: 0},
      {date: '2025-01-04', value: 1}
    ],
    firstActivityDate: '2024-06-01',
    dayToPeriodIndex
  })

  t.deepEqual([...activity], [
    [0, {count: 2, amount: 1.5, isNew: false}],
    [1, {count: 1, amount: 0, isNew: false}]
  ])
})

test('activity / flags the period of the first coworked day', t => {
  const activity = computeMemberActivity({
    activities: [{date: '2025-01-03', value: 1}],
    firstActivityDate: '2025-01-03',
    dayToPeriodIndex
  })

  t.deepEqual(activity.get(1), {count: 1, amount: 1, isNew: true})
})
