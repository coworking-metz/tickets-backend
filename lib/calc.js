import {add, sub} from 'date-fns'
import {chain, sumBy, minBy} from 'lodash-es'

/**
 * Add (1 month - 1 day) to the starting date
 * ensure that 12 subscriptions are equivalent to 1 year
 * @see https://github.com/coworking-metz/tickets-backend/pull/54#discussion_r1438295181
 */
export function computeSubcriptionEndDate(startDate) {
  return sub(add(new Date(startDate), {months: 1}), {days: 1}).toISOString().slice(0, 10)
}

/* Legacy model functions */

export function isPresenceDuringAbo(presenceDate, abos) {
  const oneMonthBefore = getDateOneMonthBefore(presenceDate)

  return abos.some(
    abo => oneMonthBefore < abo.aboStart && abo.aboStart <= presenceDate
  )
}

export function computeBalance(user, memberActivity) {
  const {memberships, tickets} = user.profile

  const oldMembershipsCount = memberships
    .filter(m => m.purchaseDate < '2017-02-01')
    .length

  const purchasedTickets = sumBy(tickets, 'tickets')

  const usedTickets = chain(memberActivity)
    .filter(activity => activity.type === 'ticket')
    .sumBy('value')
    .value()

  const firstPresence = minBy(memberActivity, 'date')
  const freeTicket = firstPresence && firstPresence.date < '2017-02-01' ? 1 : 0

  return freeTicket + oldMembershipsCount + purchasedTickets - usedTickets
}

/* Helpers */

function getDateOneMonthBefore(date) {
  return sub(new Date(date), {months: 1}).toISOString().slice(0, 10)
}
