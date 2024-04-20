import {chain} from 'lodash-es'

import mongo from '../util/mongo.js'
import {isAfter} from 'date-fns'
import {customAlphabet} from 'nanoid'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

// Const TICKET_UNIT_COST_IN_EUR = 6 // As of 2017-02-01

export async function getMemberTickets(memberId) {
  const user = await mongo.db.collection('users')
    .findOne({_id: memberId}, {projection: {'profile.tickets': 1}})

  return chain(user.profile.tickets)
    .map(ticket => ({
      _id: ticket.purchaseDate, // Until there is a unique id
      count: ticket.tickets,
      purchased: ticket.purchaseDate,
      amount: isAfter(new Date(ticket.purchaseDate), new Date('2017-02-01'))
        ? TICKET_UNIT_COST_IN_EUR * ticket.tickets
        : 0
    }))
    .orderBy(['purchased'], ['desc'])
    .value()
}

/**
 * Adds tickets to a member, both in the modern system and also adds them to the legacy system.
 *
 * @async
 * @function
 * @param {string} memberId - The ID of the member to add tickets to.
 * @param {number} ticketsQuantity - The number of tickets.
 * @param {Object} purchase - Contains information related to the purchase. This object will be spread into the payload.
 * @param {string} purchase.purchaseDate - The date the purchase was made.
 * @param {number} purchaseQuantity - The number of tickets to be added.
 *
 * @returns {Promise<Array>} An array of promises representing all the async operations.
 * This function does not resolve these promises, so calling code should handle resolution.
 *
 * @throws {MongoError} If there's an error with the MongoDB operation.
 */
export async function addTicketsToMember(memberId, ticketsQuantity, purchase, purchaseQuantity = 1) {
  const payload = {
    _id: null,
    memberId,
    ticketsQuantity, ...purchase
  }

  const payloads = []
  while (purchaseQuantity--) {
    payload._id = nanoid(17)
    payloads.push({...payload})
  }

  if (!purchase.legacy) {
    await addTicketsToMemberLegacy(memberId, purchase.purchaseDate, purchaseQuantity * ticketsQuantity)
  }

  return Promise.all(payloads.map(async payload => {
    await mongo.db.collection('tickets').insertOne(payload)
  }))
}

export async function addTicketsToMemberLegacy(memberId, purchaseDate, quantity) {
  await mongo.db.collection('users').updateOne(
    {_id: memberId},
    {
      $push: {
        'profile.tickets': {
          purchaseDate,
          tickets: quantity
        }
      }
    }
  )
}

export async function updateTicket(_id, set) {
  await mongo.db.collection('tickets').updateOne(
    {_id},
    {
      $set: set
    }
  )
}

export function computeTicketsQuantity(tickets, productType) {
  let total = 0
  for (const element of tickets) {
    if (element.productType === productType) {
      total += element.ticketsQuantity
    }
  }

  return total
}
