import {add, sub} from 'date-fns'

/**
 * Add (1 month - 1 day) to the starting date
 * ensure that 12 subscriptions are equivalent to 1 year
 * @see https://github.com/coworking-metz/tickets-backend/pull/54#discussion_r1438295181
 */
export function computeSubcriptionEndDate(startDate) {
  return sub(add(new Date(startDate), {months: 1}), {days: 1}).toISOString().slice(0, 10)
}
