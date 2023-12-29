import {chain} from 'lodash-es'

import mongo from '../util/mongo.js'
import {isAfter} from 'date-fns'

const TICKET_UNIT_COST_IN_EUR = 6 // As of 2017-02-01

export async function getMemberTickets(memberId) {
  const user = await mongo.db.collection('users')
    .findOne({_id: memberId}, {projection: {'profile.tickets': 1}})

  return chain(user.profile.tickets)
    .map(ticket => ({
      id: ticket.purchaseDate,
      count: ticket.tickets,
      purchased: ticket.purchaseDate,
      amount: isAfter(new Date(ticket.purchaseDate), new Date('2017-02-01'))
        ? TICKET_UNIT_COST_IN_EUR * ticket.tickets
        : 0
    }))
    .orderBy(['purchased'], ['desc'])
    .value()
}
