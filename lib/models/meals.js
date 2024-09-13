import mongo from '../util/mongo.js'
import {customAlphabet} from 'nanoid'
import {chain} from 'lodash-es'
import {format} from 'date-fns'
import {getUserById} from './member.js'

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')

export async function computeBalance(memberId) {
  const mealVouchers = await getMemberMealVouchers(memberId)

  const totalMealVouchers = mealVouchers.reduce((accumulator, item) => accumulator + item.meals, 0)

  const meals = await getMemberMealVouchersActivity(memberId)

  const totalMealsConsumed = meals.length

  return totalMealVouchers - totalMealsConsumed
}

export async function recomputeBalance(memberId) {
  const user = await getUserById(memberId)

  if (!user) {
    throw new Error(`User not found: ${memberId}`)
  }

  const balance = await computeBalance(memberId)

  if (balance !== user.profile.meals) {
    await mongo.db.collection('users').updateOne(
      {_id: memberId},
      {$set: {'profile.meals': balance}}
    )
  }

  return balance
}

export async function addMealsActivity(memberId, mealDate = false) {
  if (!mealDate) {
    mealDate = format(new Date(), 'yyyy-MM-dd')
  }

  await mongo.db.collection('meals_activity').updateOne({memberId, mealDate}, {$set: {updatedAt: new Date()}},
    {upsert: true})

  await recomputeBalance(memberId)
}

export async function addMealVouchersToMember(memberId, purchase) {
  const payload = {
    _id: nanoid(17),
    subscriptionId: purchase._id,
    memberId,
    purchaseDate: purchase.purchaseDate,
    orderReference: purchase.orderReference,
    meals: purchase.meals,
    meal_price: purchase.meal_price
  }
  await mongo.db.collection('meal_vouchers').insertOne(payload)
  await recomputeBalance(memberId)
}

export async function getMemberMealVouchers(memberId) {
  const meals = await mongo.db.collection('meal_vouchers')
    .find({memberId})
    .sort({purchaseDate: -1})
    .toArray()
  return meals
}

export async function getMemberMealVouchersActivity(memberId) {
  const meals = await mongo.db.collection('meals_activity').find({memberId}).toArray()
  return chain(meals)
    .orderBy(['mealDate'], ['desc'])
    .value()
}
