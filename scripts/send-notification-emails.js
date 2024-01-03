#!/usr/bin/env node
import 'dotenv/config.js'

import {sub, add} from 'date-fns'
import {chain} from 'lodash-es'

import mongo from '../lib/util/mongo.js'
import {sendMail} from '../lib/util/sendmail.js'
import renderFinAbonnement from '../lib/emails/fin-abonnement.js'
import renderPlusDeTickets from '../lib/emails/plus-de-tickets.js'

await mongo.connect()

// On commence par déterminer les utilisateurs en fin d'abonnement
const expiringAboStartDate = add(sub(new Date(), {months: 1}), {days: 1}).toISOString().slice(0, 10)
const candidateEndOfAboUsers = await mongo.db.collection('users')
  .find({'profile.abos': {$elemMatch: {aboStart: expiringAboStartDate}}})
  .project({_id: 0, email: 1, 'profile.abos': 1})
  .toArray()
const tomorrow = add(new Date(), {days: 1}).toISOString().slice(0, 10)
const oneMonthBeforeTomorrow = sub(new Date(tomorrow), {months: 1}).toISOString().slice(0, 10)
const endOfAboUsers = candidateEndOfAboUsers.filter(user => {
  const hasAboForTomorrow = user.profile.abos.some(
    abo => oneMonthBeforeTomorrow < abo.aboStart && abo.aboStart <= tomorrow
  )
  return !hasAboForTomorrow
})
const endOfAboEmails = chain(endOfAboUsers).map('email').value()
await Promise.all(endOfAboEmails.map(async email => sendMail(
  renderFinAbonnement(),
  [email]
)))

// Ensuite on s'occupe des utilisateurs qui n'ont plus de tickets
const yesterday = sub(new Date(), {days: 1}).toISOString().slice(0, 10)
const todayUsers = await mongo.db.collection('users')
  .find({'profile.heartbeat': {$gt: yesterday}})
  .project({_id: 0, email: 1, profile: 1})
  .toArray()
const today = (new Date()).toISOString().slice(0, 10)
const oneMonthAgo = sub(new Date(), {months: 1}).toISOString().slice(0, 10)
const outOfTicketsUsers = todayUsers.filter(user => {
  const isDuringAbo = user.profile.abos.some(abo => oneMonthAgo < abo.aboStart && abo.aboStart <= today)
  return !isDuringAbo && user.profile.balance <= 0
})
const outOfTicketsEmails = chain(outOfTicketsUsers).map('email').value()
await Promise.all(outOfTicketsEmails.map(async email => sendMail(
  renderPlusDeTickets(),
  [email]
)))

await mongo.disconnect()

