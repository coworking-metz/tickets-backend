#!/usr/bin/env node
import 'dotenv/config.js'

import mongo from '../util/mongo.js'
import {Decimal128} from 'mongodb'

import process from 'node:process'
import got from 'got'
import {customAlphabet} from 'nanoid'
import * as Member from './member.js'

const {
  WORDPRESS_BASE_URL
} = process.env

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

/**
 * Converts the price imported from the ecommerce website from a string to a Decimal128 version of the price, in cents
 * @param {string} priceString
 * @returns {Decimal128}
 */
export function formatPrice(priceString) {
  let price = Decimal128.fromString(priceString)
  price *= 100 // Common practice is to store the value in the smallest denomination (e.g., cents for euros)
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
 * Stores a product purchase in the database.
 * The price is inserted in the collection as many times as the quantity
 *
 * @param {string} memberId - The unique identifier for a member.
 * @param {string} orderReference - The unique identifier for the order.
 * @param {Object} product - The product being sold, including price, quantity, and product type.
 * @param {number} product.price - The price of the product.
 * @param {number} product.quantity - The quantity of the product sold.
 * @param {string} product.product_type - The type of product.
 * @param {boolean} imported - Let us know if the data is about an old order that as been imported via pucharses-import.js
 */

export async function storeProductPurchase(memberId, orderReference, product, imported = false) {
  const insertPromises = []

  for (let i = 0; i < product.quantity; i++) {
    const insertPromise = mongo.db.collection('purchases').insertOne({
      _id: nanoid(17),
      memberId,
      orderReference,
      price: formatPrice(product.price),
      productType: product.product_type || product.productType,
      imported,
      product
    })
    insertPromises.push(insertPromise)
  }

  await Promise.all(insertPromises)
}

/**
 * Returns the unique list of orders that are already present in the `purchases` collection
 * @returns {array}
 */
export async function findUniqueOrderReferences() {
  const result = await mongo.db.collection('purchases').distinct('orderReference')
  return result
}

/**
 * Delete all the imported purchases in the collection (usefull when we want to re-import everything without having doubles)
 * @returns null
 */
export async function deleteImportedPurchases() {
  await mongo.db.collection('purchases').deleteMany({imported: true})
}

/**
 * Function to import purchases from a given year.
 * It fetches order data from the WordPress API, checks for unique orders not previously imported,
 * and stores each product purchase in the database.
 *
 * @export
 * @async
 * @function
 * @param {Number} year - The year from which orders will be imported.
 * @returns {Promise<Boolean>} Returns true upon successful execution.
 *
 * @throws {Error} If there are issues connecting to the WordPress API or storing data in the database.
 *
 */
export async function importPurchases(year) {
  console.log(`Importing orders from ${year}`)

  const orderReferences = await findUniqueOrderReferences()

  const response = await got(`${WORDPRESS_BASE_URL}/api-json-wp/cowo/v1/commandes/${year}`, {
    responseType: 'json',
    username: process.env.WP_APIV2_USERNAME,
    password: process.env.WP_APIV2_PASSWORD
  })

  const orders = response.body
  console.log(orders.length, `orders to import for ${year}`)
  let importedOrders = 0
  await Promise.all(orders.map(async order => {
    if (orderReferences.includes(order.orderReference)) {
      return
    }

    const {orderReference, wpUserId, products} = order
    if (!wpUserId) {
      return
    }

    const userId = await Member.reconcileWithWordpressId(wpUserId)
    await Promise.all(products.map(async product => {
      await storeProductPurchase(userId, orderReference, product, true)
    }))
    importedOrders++
  }))
  console.log(importedOrders, `orders imported for ${year}`)

  return true
}

