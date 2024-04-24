import * as MigrationTools from '../migration/migration-tools.js'
import * as Purchase from '../models/purchase.js'
import * as Ticket from '../models/ticket.js'
import * as Member from '../models/member.js'
import * as Wordpress from '../util/wordpress.js'

/**
 * Migrates purchases to collections.
 *
 * This function retrieves all purchases stored in the users collection, and then migrates them in 3 collections depending on the productType : subscriptions, memberships or tickets.
 * If a user does not have any 'ticket', 'membership', or 'subscription' purchases, they are skipped.
 * In the end, it organizes the purchases by year and product type, and processes them accordingly.
 *
 * @async
 * @export
 * @function migratePurchasesToCollections
 * @returns {Promise} Returns a Promise that resolves when all purchases have been processed.
 * @throws Will throw an error if the processing fails.
 */
export async function migratePurchasesToCollections() {
  console.log('Deleting previously imported purchases')
  await Purchase.deleteImportedPurchases()
  console.log('Fetching users')
  const members = await Member.getAllUsers()

  const productTypes = ['subscription', 'membership', 'ticket']
  const purchases = {}

  console.log('Collecting purchases for each user')
  for (const member of members) {
    const {profile} = member
    if (!profile.tickets?.length && !profile.memberships?.length && !profile.subscriptions?.length) {
      continue
    }

    for (const productType of productTypes) {
      const collectionName = MigrationTools.legacyCollectionName(productType)
      for (const product of profile[collectionName]) {
        product.memberId = member._id
        const year = product.purchaseDate.split('-')[0]
        purchases[year] = purchases[year] || []
        purchases[year][collectionName] = purchases[year][collectionName] || []
        purchases[year][collectionName].push(product)
      }
    }
  }

  const years = Purchase.getYears()

  for (const year of years) {
    if (!purchases[year]) {
      continue // Skip years without purchases
    }

    console.log(`Migrating purchases of ${year}`)
    for (const productType of productTypes) {
      const collectionName = MigrationTools.legacyCollectionName(productType)
      await processPurchasesProducts(productType, purchases[year][collectionName]) // eslint-disable-line no-await-in-loop
    }
  }
}

/**
 * Processes all products of a specific product type.
 *
 * @async
 * @export
 * @param {string} productType - The type of the product to be processed.
 * @param {Array<object>} products - An array of products of the specified type.
 *
 * If there are no products, the function returns immediately without doing anything.
 * Each product in the products array is processed individually using the processPurchasesProductType method from the MigrationTools module.
 */
export async function processPurchasesProducts(productType, products) {
  if (!products) {
    return
  }

  const total = products.length
  console.log(`${total} ${productType} to migrate`)

  for (const product of products) {
    await MigrationTools.processPurchasesProductType(product, productType) // eslint-disable-line no-await-in-loop
  }
}

/**
 * Imports orders for a given year from WordPress/Woocommerce.
 *
 * @async
 * @function importOrdersForYear
 * @param {number} year - The year from which the orders should be imported.
 * @returns {Promise<boolean>} Returns a Promise that resolves to true when all orders have been successfully imported.
 *
 * @throws {Error} If there is any error during the process, the function will throw an error and stop execution.
 *
 * @example
 * await importOrdersForYear(2022)
 */
export async function importOrdersForYear(year) {
  console.log(`Importing orders from ${year}`)

  const orders = await Wordpress.getOrders(year)
  console.log(orders.length, `orders to import for ${year}`)

  let importedOrders = 0
  await Promise.all(orders.map(async order => {
    if (await importOrder(order)) {
      importedOrders++
    }
  }))
  console.log(importedOrders, `orders imported for ${year}`)

  return true
}

/**
 * Imports an order into the database.
 *
 * The function retrieves a user based on their WordPress ID (`wpUserId`), and get the memberId from the wpuserId.
 * The function will then apply the orderReference on all purchases made on the day of the order by the member
 * This behaviour is not perfect: In the case of multiple orders by the same person on the same day, the data will be incoherent. But the amount of incoherent orders is low, an dit will be possible to corect thoses manually in the future.
 *
 * There are also inconsistencies between orders in wordpress and the real number of products in the backend collections.
 * Thoses are due to manual modifications made in the past and are ignored.
 *
 * @async
 * @exports
 * @function importOrder
 * @param {Object} order - An object representing an order. It must contain a `wpUserId`, `products`, and `purchaseDate`.
 * @param {string} order.wpUserId - The WordPress ID of the user who made the purchase.
 * @param {Array.<Object>} order.products - Array of product objects associated with the order.
 * @param {string} order.purchaseDate - The date the purchase was made, in "YYYY-MM-DD" format.
 * @returns {Promise<boolean>} Returns true if the operation was successful, otherwise nothing is returned.
 */
export async function importOrder(order) {
  const {wpUserId, products} = order

  const [purchaseDate] = order.purchaseDate.split(' ')

  if (!wpUserId) {
    return
  }

  const user = await Member.getUserByWordpressId(wpUserId)
  if (!user) {
    return
  }

  const userId = user._id
  const purchases = await Purchase.findByMemberAndDate(userId, purchaseDate, {orderReference: null, legacy: true})
  const payload = {}
  for (const product of products) {
    const {productType} = product
    if (!productType) {
      continue
    }

    const collectionName = MigrationTools.convertProductTypeToCollectionName(productType)
    if (collectionName) {
      payload[collectionName] = handleOrderProduct(product, purchases, {order, mustBeCoherent: false})
    }
  }

  await Purchase.updatePurchases(payload)
  return true
}

/**
 * Processes and applies order information to relevant products within a user's purchases.
 *
 * @async
 * @export
 * @param {Object} product - The product to be processed
 * @param {Array} purchases - An array of purchases made by the user
 * @param {Object} options - Additional options for processing
 * @param {boolean} [options.mustBeCoherent=false] - If true, the function checks whether the products quantity matches between orders and purchases
 * @param {Object} options.order - The order in context
 * @returns {Array}
 *
 * @example
 * handleOrderProduct(product, purchases, { mustBeCoherent: true, order: someOrder });
 */
export function handleOrderProduct(product, purchases, options = {}) {
  const {productType} = product
  if (!productType) {
    return
  }

  const {mustBeCoherent, order} = options
  const quantities = MigrationTools.computeProductQuantities(order.products)
  const {subscriptions, memberships, tickets} = purchases
  /**
   * Adds the order informations in the local collections. If asked, will assess whether the quantity is coherent or
   * not between the wordpress order and the local collection.
   *
   * @param {Array} items - The list of items to handle.
   * @param {string} type - The type of the product that needs to be handled.
   * @param {Function} quantityCompute - Optional. Function to compute quantities.
   * @param {number} multiplier - Optional. A number by which product quantity should be multiplied. Defaults to 1.
   *
   */
  const handleOrderProductByType = (items, type, quantityCompute = null, multiplier = 1) => {
    if (items.length > 0 && productType === type) {
      let coherent = true
      if (mustBeCoherent) {
        coherent = isCoherent(items, type, quantityCompute, multiplier)
      }

      return MigrationTools.addOrderInfo(order.orderReference, items, product, coherent)
    }
  }

  const isCoherent = (items, type, quantityCompute = null, multiplier = 1) => {
    const itemsQuantity = quantityCompute ? quantityCompute(items, type) : items.length

    if (itemsQuantity === product.quantity * multiplier) {
      return true
    }

    if (itemsQuantity === quantities[type]) {
      return true
    }

    if (items.length === quantities[type]) {
      return true
    }

    return false
  }

  handleOrderProductByType(tickets, 'ticketsBook', Ticket.computeTicketsQuantity, 10)
  handleOrderProductByType(tickets, 'singleTicket', Ticket.computeTicketsQuantity)
  handleOrderProductByType(memberships, 'membership')
  handleOrderProductByType(subscriptions, 'subscription')
}
