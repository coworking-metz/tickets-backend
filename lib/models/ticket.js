import {chain} from 'lodash-es'

import mongo from '../util/mongo.js'
import {isAfter} from 'date-fns'
import {customAlphabet} from 'nanoid'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

export function formatTicket(ticketOrderFromDatabase) {
  return {
    _id: ticketOrderFromDatabase._id,
    orderReference: ticketOrderFromDatabase.orderReference,
    count: ticketOrderFromDatabase.ticketsQuantity,
    purchased: ticketOrderFromDatabase.purchaseDate,
    amount: ticketOrderFromDatabase.price
  }
}

export async function getMemberTickets(memberId) {
  const tickets = await mongo.db.collection('tickets').find({memberId}).toArray()
  return chain(tickets)
    .map(t => formatTicket(t))
    .orderBy(['purchased'], ['desc'])
    .value()
}

/**
 * Adds tickets to a member, both in the modern system and also adds them to the users collection for data consistency.
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
  for (let i = 0; i < purchaseQuantity; i++) {
    payload._id = nanoid(17)
    payloads.push({...payload})
  }

  if (!purchase.migratedFromUsersCollection) {
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
  const updatedTicket = await mongo.db.collection('tickets').findOneAndUpdate(
    {_id},
    {
      $set: set
    },
    {returnDocument: 'after'}
  )

  // DEPRECATED - we should avoid updating the users collection directly
  await mongo.db.collection('users').updateOne(
    {
      _id: updatedTicket.value.memberId,
      'profile.tickets.purchaseDate': updatedTicket.value.purchaseDate
    },
    {
      $set: {
        'profile.tickets.$.tickets': set.ticketsQuantity
      }
    }
  )

  return updatedTicket.value
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

/**
 * Calculate the unit price of a ticket based on its date.
 *
 * @param {Date} date - The date the ticket was purchased.
 * @returns {number} The unit price of the ticket. If the date is after February 1, 2017, the price is 60; otherwise it's 0.
 */
export function ticketUnitPriceByDate(date) {
  let price = 0
  if (isAfter(new Date(date), new Date('2024-04-31'))) {
    price = 8
  } else if (isAfter(new Date(date), new Date('2017-02-01'))) {
    price = 6
  }

  return price
}
