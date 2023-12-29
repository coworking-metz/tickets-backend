import {chain} from 'lodash-es'

import {add, isAfter} from 'date-fns'
import mongo from '../util/mongo.js'

const SUBSCRIPTION_UNIT_COST_IN_EUR = 60 // As of 2017-02-01

export async function getMemberSubscriptions(memberId) {
  const user = await mongo.db.collection('users')
    .findOne({_id: memberId}, {projection: {'profile.abos': 1}})

  return chain(user.profile.abos)
    .map(abo => ({
      id: abo.purchaseDate,
      purchased: abo.purchaseDate,
      started: abo.aboStart,
      ended: add(new Date(abo.aboStart), {days: 30}).toISOString().slice(0, 10),
      amount: isAfter(new Date(abo.purchaseDate), new Date('2017-02-01'))
        ? SUBSCRIPTION_UNIT_COST_IN_EUR
        : 0
    }))
    .orderBy(['purchased'], ['desc'])
    .value()
}
