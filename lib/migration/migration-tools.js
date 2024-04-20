import * as Ticket from '../models/ticket.js'
import * as Subscription from '../models/subscription.js'
import * as Membership from '../models/membership.js'
import {formatPrice} from '../models/purchase.js'
import {isAfter} from 'date-fns'
import process from 'node:process'
import util from 'node:util'

/**
 * Calculates and returns the total quantity of each type of product in the provided array.
 *
 * @param {Object[]} products - An array of product objects, where each object should have a 'productType' and 'quantity' property.
 * @return {Object} An object mapping product types to their total quantities.
 *
 * @example
 *
 *     const products = [
 *       { productType: 'membership', quantity: 2 },
 *       { productType: 'subscription', quantity: 3 },
 *       { productType: 'membership', quantity: 1 }
 *     ]
 *
 *     computeProductQuantities(products)
 *     // Returns: { membership: 3, subscription: 3 }
 */
export function computeProductQuantities(products) {
  const quantities = {}
  for (const product of products) {
    const {productType} = product
    if (!productType) {
      continue
    }

    quantities[productType] = quantities[productType] || 0
    quantities[productType] += product.quantity
  }

  return quantities
}

/**
 * Processes purchases based on product type such as 'ticket', 'subscription' or 'membership'.
 *
 * @param {Object} product - The product object to be processed.
 * @param {string} productType - The type of the product. Can be 'ticket', 'subscription' or 'membership'.
 * @returns {Promise<void>} A Promise that resolves when the processing is done.
 *
 * @throws {Error} Throws an error if processing fails.
 */
export async function processPurchasesProductType(product, productType) {
  if (productType === 'ticket') {
    const purchase = createPurchaseObjectTicket(product)
    await Ticket.addTicketsToMember(product.memberId, product.tickets, purchase)
  }

  if (productType === 'subscription') {
    const purchase = createPurchaseObjectAbo(product)
    await Subscription.addSubscriptionsToMember(product.memberId, product.aboStart, purchase)
  }

  if (productType === 'membership') {
    const purchase = createPurchaseObjectMembership(product)
    await Membership.addMembershipToMember(product.memberId, product.membershipStart, purchase)
  }
}

/**
 * Creates and returns a purchase object for a ticket type product.
 *
 * @param {Object} product - The product details.
 *
 * @returns {Object} Returns a purchase object tickets properties, 'legacy' and 'price'.
 */
export function createPurchaseObjectTicket(product) {
  let productType = 'tiketsBook'
  if (product.tickets < 10) {
    productType = 'uniqueTicket'
  }

  return {
    purchaseDate: product.purchaseDate,
    orderReference: null,
    productType,
    legacy: true,
    price: formatPrice(product.tickets * ticketUnitPriceByDate(product.purchaseDate))
  }
}

/**
 * Creates and returns a purchase object for a membership type product.
 *
 * @param {Object} product - The product object from which the purchase is being made.
 *
 * @returns {Object} Returns a purchase object memberships properties, 'legacy' and 'price'.
 */
export function createPurchaseObjectMembership(product) {
  return {
    purchaseDate: product.purchaseDate,
    orderReference: null,
    productType: 'membership',
    membershipStart: product.membershipStart,
    legacy: true,
    price: formatPrice(membershipUnitPriceByDate(product.purchaseDate))
  }
}

/**
 * Creates and returns a purchase object for a subscription type product.
 *
 * @param {Object} product - The product details.
 *
 * @returns {Object} Returns a purchase object subscriptions properties, 'legacy' and 'price'.
 */
export function createPurchaseObjectAbo(product) {
  return {
    purchaseDate: product.purchaseDate,
    orderReference: null,
    productType: 'subscription',
    startDate: product.aboStart,
    legacy: true,
    price: formatPrice(subscriptionUnitPriceByDate(product.purchaseDate))
  }
}

/**
 * Calculate the unit price of a subscription based on its date.
 *
 * @param {Date} date - The date the subscription was purchased.
 * @returns {number} The unit price of the subscription. If the date is after February 1, 2017, the price is 60; otherwise it's 0.
 */
export function subscriptionUnitPriceByDate(date) {
  if (isAfter(new Date(date), new Date('2017-02-01'))) {
    return 60
  }

  return 0
}

/**
 * Calculate the unit price of a ticket based on its date.
 *
 * @param {Date} date - The date the ticket was purchased.
 * @returns {number} The unit price of the ticket. If the date is after February 1, 2017, the price is 60; otherwise it's 0.
 */
export function ticketUnitPriceByDate(date) {
  if (isAfter(new Date(date), new Date('2017-02-01'))) {
    return 60
  }

  return 0
}

/**
 * Calculate the unit price of a membership based on its date.
 *
 * @param {Date} date - The date the membership was purchased.
 * @returns {number} The unit price of the membership. If the date is after January 1, 2014, the price is 10; otherwise it's 0.
 */
export function membershipUnitPriceByDate(date) {
  if (isAfter(new Date(date), new Date('2014-01-01'))) {
    return 10
  }

  return 0
}

/**
 * Adds order information to a set of purchases.
 *
 * @param {string} orderReference - The reference number for the order.
 * @param {Array<Object>} purchases - An array of purchase objects which need to be updated.
 * @param {Object} product - An object containing product details. It should at least contain 'price'.
 * @param {boolean} [coherent=true] - A boolean flag that states if the order is coherent or not.
 *
 * @return {Array<Object>} Updated purchases with added order information.
 */
export function addOrderInfo(orderReference, purchases, product, coherent = true) {
  for (const purchase of purchases) {
    purchase.coherent = coherent
    purchase.orderReference = orderReference
    purchase.price = purchase.price || formatPrice(product.price)
  }

  return purchases
}

/**
 * Converts a product type to its corresponding collection name.
 *
 * @param {string} productType - The product type to be converted.
 * @returns {string} The corresponding collection name. For 'ticket' product types, it returns 'tickets'.
 * For 'membership', it returns 'memberships'. And for 'subscription', it returns 'subscriptions'.
 */
export function convertProductTypeToCollectionName(productType) {
  if (productType.toLowerCase().includes('ticket')) {
    return 'tickets'
  }

  if (productType === 'membership') {
    return 'memberships'
  }

  if (productType === 'subscription') {
    return 'subscriptions'
  }

  console.log(productType)
}

/**
 * Returns the corresponding collection name for a given product type.
 * If the converted product type is 'subscriptions', it returns 'abos'.
 *
 * @export
 * @param {string} productType - The type of product.
 *
 * @returns {string} Translated collection name, 'abos' if product type corresponds to 'subscriptions', or the original collection name otherwise.
 */
export function legacyCollectionName(productType) {
  const collectionName = convertProductTypeToCollectionName(productType)
  if (collectionName === 'subscriptions') {
    return 'abos'
  }

  return collectionName
}
