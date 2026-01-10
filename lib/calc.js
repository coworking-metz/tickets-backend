import {add, sub} from 'date-fns'
import {chain, sumBy} from 'lodash-es'
import * as Ticket from './models/ticket.js'

/**
 * Add (1 month - 1 day) to the starting date
 * ensure that 12 subscriptions are equivalent to 1 year
 * @see https://github.com/coworking-metz/tickets-backend/pull/54#discussion_r1438295181
 */
export function computeSubscriptionEndDate(startDate) {
  return sub(add(new Date(startDate), {months: 1}), {days: 1}).toISOString().slice(0, 10)
}

export function computeEarliestSubscriptionStartingDateForDate(date) {
  return add(sub(new Date(date), {months: 1}), {days: 1}).toISOString().slice(0, 10)
}

/* Legacy model functions */

export function isPresenceDuringAbo(presenceDate, abos) {
  const oneMonthBefore = getDateOneMonthBefore(presenceDate)

  return abos.some(
    abo => oneMonthBefore < abo.aboStart && abo.aboStart <= presenceDate
  )
}

export async function computeBalance(user, memberActivity) {
  const ticketsOrders = await Ticket.getMemberTickets(user._id)
  const purchasedTickets = sumBy(ticketsOrders, 'count')

  const usedTickets = chain(memberActivity)
    .filter(activity => activity.type === 'ticket')
    .sumBy('value')
    .value()

  return purchasedTickets - usedTickets
}

/* Helpers */

function getDateOneMonthBefore(date) {
  return sub(new Date(date), {months: 1}).toISOString().slice(0, 10)
}
