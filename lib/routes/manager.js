import {isAfter, sub} from 'date-fns'
import express from 'express'
import createError from 'http-errors'
import {chain} from 'lodash-es'
import mongo from '../util/mongo.js'
import w from '../util/w.js'

export const isUserAdmin = (_req, res, next) => {
  if (!res.locals.user.roles.includes('administrator')) {
    throw createError(403)
  }

  next()
}

const formatUserToMember = user => {
  const [firstEmail] = user.emails

  const sixMonthsAgo = sub(new Date(), {months: 6})

  const sixMonthsActivity = chain(user.profile.presences)
    .filter(p => p?.date && isAfter(new Date(p.date), sixMonthsAgo))
    .sumBy('amount')
    .value()

  return {
    id: user._id,
    created: user.createdAt,
    firstname: user.profile.firstName,
    lastname: user.profile.lastName,
    email: firstEmail?.address,
    lastSeen: user.profile.heartbeat,
    active: sixMonthsActivity >= 20,
  }
}

export function managerRouter() {
  const router = new express.Router()

  router.get('/members', w(async (req, res) => {
    const users = await mongo.db.collection('users').find({}).toArray()
    res.send(chain(users)
      .map(formatUserToMember)
      .sortBy(member => -member.created)
      .value()
    )
  }))

  router.get('/members/:id', w(async (req, res) => {
    const user = await mongo.db.collection('users').findOne({_id: req.params.id})
    const member = formatUserToMember(user)

    res.send({
      ...member,
      birthdate: user.profile.birthDate,
      balance: user.profile.balance,
      devices: user.profile.macAddresses.map(macAddress => ({
        macAddress
      }))
    })
  }))

  return router
}
