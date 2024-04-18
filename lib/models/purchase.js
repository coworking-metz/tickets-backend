#!/usr/bin/env node
import 'dotenv/config.js'

import mongo from '../util/mongo.js'
import process from 'node:process'
import got from 'got'
import {customAlphabet} from 'nanoid'
import * as Member from './member.js'

const {
  WORDPRESS_BASE_URL
} = process.env

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

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
 *
 * @param {string} memberId - The unique identifier for a member.
 * @param {string} orderReference - The unique identifier for the order.
 * @param {Object} item - The item being sold, including price, quantity, and product type.
 * @param {number} item.price - The price of the item.
 * @param {number} item.quantity - The quantity of the item sold.
 * @param {string} item.product_type - The type of product.
 */

export async function storeProductPurchase(memberId, orderReference, item, imported = false) {
  await mongo.db.collection('purchases').insertOne({
    _id: nanoid(17),
    memberId,
    orderReference,
    price: item.price,
    quantity: item.quantity,
    productType: item.product_type || item.productType,
    imported,
    item
  })
}

export async function findUniqueOrderReferences() {
  const result = await mongo.db.collection('purchases').distinct('orderReference')
  return result
}

export async function deleteImportedPurchases() {
  await mongo.db.collection('purchases').deleteMany({imported: true})
}

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

