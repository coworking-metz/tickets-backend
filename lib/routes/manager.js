import {add, isAfter, sub} from 'date-fns'
import express from 'express'
import createError from 'http-errors'
import {chain} from 'lodash-es'
import mongo from '../util/mongo.js'
import w from '../util/w.js'
import {isPresenceDuringAbo} from '../models.js'
import {resolveUser} from '../api.js'

const SUBSCRIPTION_UNIT_COST_IN_EUR = 60
const SUBSCRIPTION_PERIOD_IN_DAYS = 30
const TICKET_UNIT_COST_IN_EUR = 6

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
    wordpressUserId: user.wpUserId,
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

  router.get('/members/:userId', w(resolveUser), w(async (req, res) => {
    const member = formatUserToMember(req.user)

    res.send({
      ...member,
      birthdate: req.user.profile.birthDate,
      balance: req.user.profile.balance,
      devices: req.user.profile.macAddresses.map(macAddress => ({
        macAddress
      }))
    })
  }))

  router.get('/members/:userId/presences', w(resolveUser), w(async (req, res) => {
    const presences = chain(req.user.profile.presences)
      .map(presence => ({
        date: presence.date,
        amount: presence.amount,
        type: isPresenceDuringAbo(presence.date, req.user.profile.abos) ? 'SUBSCRIPTION' : 'TICKET'
      }))
      .orderBy(['date'], ['desc'])
      .value()

    res.send(presences)
  }))

  router.get('/members/:userId/subscriptions', w(resolveUser), w(async (req, res) => {
    const subscriptions = chain(req.user.profile.abos)
      .map(subscription => ({
        id: subscription.purchaseDate,
        startDate: subscription.aboStart,
        endDate: add(
          new Date(subscription.aboStart),
          {days: SUBSCRIPTION_PERIOD_IN_DAYS}
        ).toISOString().slice(0, 10),
        purchased: subscription.purchaseDate,
        amount: SUBSCRIPTION_UNIT_COST_IN_EUR,
        currency: 'EUR',
      }))
      .orderBy(['purchased'], ['desc'])
      .value()

    res.send(subscriptions)
  }))

  router.get('/members/:userId/tickets', w(resolveUser), w(async (req, res) => {
    const tickets = chain(req.user.profile.tickets)
      .map(ticket => ({
        id: ticket.purchaseDate,
        count: ticket.tickets,
        purchased: ticket.purchaseDate,
        amount: isAfter(new Date(ticket.purchaseDate), new Date('2017-02-01'))
          ? TICKET_UNIT_COST_IN_EUR * ticket.tickets
          : 0,
        currency: 'EUR',
      }))
      .orderBy(['purchased'], ['desc'])
      .value()

    res.send(tickets)
  }))

  return router
}
