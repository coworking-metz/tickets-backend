import mongo from '../util/mongo.js'

import {customAlphabet} from 'nanoid'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

/**
 * Stores a product sale in the database.
 *
 * @param {string} memberId - The unique identifier for a member.
 * @param {string} orderReference - The unique identifier for the order.
 * @param {Object} item - The item being sold, including price, quantity, and product type.
 * @param {number} item.price - The price of the item.
 * @param {number} item.quantity - The quantity of the item sold.
 * @param {string} item.product_type - The type of product.
 */

export async function storeProductSale(memberId, orderReference, item) {
  await mongo.db.collection('sales_').insertOne({
    _id: nanoid(17),
    memberId,
    orderReference,
    price: item.price,
    quantity: item.quantity,
    productType: item.product_type,
    item
  })
}
