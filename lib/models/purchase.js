#!/usr/bin/env node
import 'dotenv/config.js'
import * as Ticket from '../models/ticket.js'
import * as Subscription from '../models/subscription.js'
import * as Membership from '../models/membership.js'

import mongo from '../util/mongo.js'

export function findByMemberAndDate(memberId, purchaseDate, additionalFilters = {}) {
  // Build the base query object

  // Create an array of promises for each collection query
  const promises = [
    mongo.db.collection('tickets').find({memberId, purchaseDate, ...additionalFilters}).toArray(),
    mongo.db.collection('memberships').find({memberId, purchaseDate, ...additionalFilters}).toArray(),
    mongo.db.collection('subscriptions').find({memberId, purchaseDate, ...additionalFilters}).toArray()
  ]

  // Use Promise.all to wait for all promises to resolve
  return Promise.all(promises)
    .then(results => ({
      tickets: results[0],
      memberships: results[1],
      subscriptions: results[2]
    }))
    .catch(error => {
      console.error('Error fetching data:', error)
      throw error
    })
}

export async function updatePurchases(purchases) {
  const {memberships, subscriptions, tickets} = purchases
  if (memberships) {
    await Promise.all(memberships.map(async membership => {
      await Membership.updateMembership(membership._id, {price: membership.price, orderReference: membership.orderReference})
    }))
  }

  if (tickets) {
    await Promise.all(tickets.map(async ticket => {
      await Ticket.updateTicket(ticket._id, {price: ticket.price, orderReference: ticket.orderReference})
    }))
  }

  if (subscriptions) {
    await Promise.all(subscriptions.map(async subscription => {
      await Subscription.updateSubscription(subscription._id, {price: subscription.price, orderReference: subscription.orderReference})
    }))
  }

  return true
}

/**
 * Formats a purchase into a specified object structure.
 *
 * @function
 * @async
 * @exports formatPurchase
 * @param {string} orderReference - A unique reference for the order.
 * @param {Date} purchaseDate - The date of the purchase.
 * @param {Object} purchase - An object containing information about the purchase.
 * @param {number} purchase.price - The price of the product purchased
 * @param {string} purchase.productType - The type of product that was purchased.
 * @returns {Object} Returns an object with properties purchaseDate, orderReference, productType, and formatted price.
 */
export function formatPurchase(orderReference, purchaseDate, purchase) {
  const {price, productType} = purchase
  return {
    purchaseDate,
    orderReference,
    productType,
    price: formatPrice(price)
  }
}

/**
 * Converts the price imported from the ecommerce website from a string
 * @param {string} priceString
 * @returns {Float}
 */
export function formatPrice(priceString) {
  const price = Number.parseFloat(String(priceString))
  return price
}

/**
 * Return the list of the years where the organisation was active (from 2014 to the current year)
 * @returns {array}
 */
export function getYears() {
  const startYear = 2014
  const currentYear = new Date().getFullYear()
  const years = []
  for (let year = startYear; year <= currentYear; year++) {
    years.push(year)
  }

  return years
}

/**
 * Delete all the imported purchases in the collection (usefull when we want to re-import everything without having doubles)
 * @returns null
 */
export async function deleteImportedPurchases() {
  await mongo.db.collection('tickets').deleteMany({migratedFromUsersCollection: true})
  await mongo.db.collection('subscriptions').deleteMany({migratedFromUsersCollection: true})
  await mongo.db.collection('memberships').deleteMany({migratedFromUsersCollection: true})
}
