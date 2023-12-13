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

export function managerRouter() {
  const router = new express.Router()

  router.get('/members', w(async (req, res) => {
    const members = await mongo.db.collection('users').find({}).toArray()
    res.send(chain(members)
      .map(member => {
        const [firstEmail] = member.emails

        const sixMonthsAgo = sub(new Date(), {months: 6})

        const sixMonthsActivity = chain(member.profile.presences)
          .filter(p => p?.date && isAfter(new Date(p.date), sixMonthsAgo))
          .sumBy('amount')
          .value()

        return {
          id: member._id,
          created: member.createdAt,
          firstname: member.profile.firstName,
          lastname: member.profile.lastName,
          email: firstEmail?.address,
          lastSeen: member.profile.heartbeat,
          active: sixMonthsActivity >= 20,
        }
      })
      .sortBy(u => -u.created)
      .value()
    )
  }))

  return router
}
