import {chain} from 'lodash-es'

import mongo from '../util/mongo.js'
import {isPresenceDuringAbo} from '../models.js'

export async function getMemberPresences(memberId) {
  const user = await mongo.db.collection('users')
    .findOne({_id: memberId}, {projection: {'profile.presences': 1}})

  return chain(user.profile.presences)
    .map(presence => ({
      date: presence.date,
      amount: presence.amount,
      type: isPresenceDuringAbo(presence.date, user.profile.abos) ? 'A' : 'T'
    }))
    .sortBy('date', 'desc')
    .value()
}
