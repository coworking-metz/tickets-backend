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
    meal_price: purchase.meal_price,
    createdAt: new Date()
  }
  await mongo.db.collection('meal_vouchers').insertOne(payload)
  await recomputeBalance(memberId)
}

export async function getMealVouchers({purchaseDate}) {
  const {startDate, endDate} = purchaseDate

  // Fetch meal vouchers
  const meals = await mongo.db.collection('meal_vouchers')
    .find({
      purchaseDate: {
        $gte: startDate,
        $lt: endDate
      }
    })
    .sort({createdAt: -1})
    .toArray()

  // Extract member IDs from the meal vouchers
  const memberIds = [...new Set(meals.map(meal => meal.memberId))]

  // Fetch user emails based on member IDs
  const users = await mongo.db.collection('users')
    .find({_id: {$in: memberIds}})
    .project({_id: 1, email: 1})
    .toArray()

  // eslint-disable-next-line unicorn/no-array-reduce
  const emailMap = users.reduce((acc, user) => {
    acc[user._id] = user.email
    return acc
  }, {})

  // Enrich meal vouchers with emails
  const enrichedMeals = meals.map(meal => ({
    ...meal,
    email: emailMap[meal.memberId] || null
  }))

  return enrichedMeals
}

export async function getMealsActivity({mealDate}) {
  const {startDate, endDate} = mealDate

  // Fetch meal vouchers
  const meals = await mongo.db.collection('meals_activity')
    .find({
      mealDate: {
        $gte: startDate,
        $lt: endDate
      }
    })
    .sort({updatedAt: -1})
    .toArray()

  // Extract member IDs from the meal vouchers
  const memberIds = [...new Set(meals.map(meal => meal.memberId))]

  // Fetch user emails based on member IDs
  const users = await mongo.db.collection('users')
    .find({_id: {$in: memberIds}})
    .project({_id: 1, email: 1})
    .toArray()

  // eslint-disable-next-line unicorn/no-array-reduce
  const emailMap = users.reduce((acc, user) => {
    acc[user._id] = user.email
    return acc
  }, {})

  // Enrich meal vouchers with emails
  const enrichedMeals = meals.map(meal => ({
    ...meal,
    email: emailMap[meal.memberId] || null
  }))

  return enrichedMeals
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

export async function getMealsStats(date) {
  date = new Date(date)
  const startDate = date.toISOString().slice(0, 10)
  date.setMonth(date.getMonth() + 1)
  const endDate = date.toISOString().slice(0, 10)
  const mealVouchers = await getMealVouchers({purchaseDate: {startDate, endDate}})
  const mealsActivity = await getMealsActivity({mealDate: {startDate, endDate}})

  const soldQuantity = mealVouchers.reduce((total, meal) => total + meal.meals, 0)
  const soldAmount = mealVouchers.reduce((total, meal) => total + (meal.meal_price * meal.meals), 0)
  const usedQuantity = mealsActivity.length

  // eslint-disable-next-line unicorn/no-array-reduce
  const weekdayCounts = mealsActivity.reduce((acc, {mealDate}) => {
    const weekday = new Date(mealDate).toLocaleString('en-US', {weekday: 'long'}).toLowerCase()
    acc[weekday] = (acc[weekday] || 0) + 1
    return acc
  }, {})

  // eslint-disable-next-line unicorn/no-array-reduce
  const dayOfMonthCounts = mealsActivity.reduce((acc, {mealDate}) => {
    const day = new Date(mealDate).getDate()
    acc[day] = (acc[day] || 0) + 1
    return acc
  }, {})

  // Calculate average meals per day for the month
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const averageMealsPerDay = (usedQuantity / daysInMonth).toFixed(2)

  const stats = {
    sold: {quantity: soldQuantity, amount: soldAmount},
    used: {quantity: usedQuantity,
      weekdays: weekdayCounts,
      daysOfMonth: dayOfMonthCounts,
      averagePerDay: averageMealsPerDay
    }
  }

  return stats
}
