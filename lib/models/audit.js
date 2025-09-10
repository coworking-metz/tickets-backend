import {add} from 'date-fns'
import mongo from '../util/mongo.js'
import * as Member from './member.js'

export async function logAuditTrail(author, action, context) {
  if (!action) {
    throw new Error('Audit trail action is required')
  }

  const executedBy = author?.impersonatedBy || author

  await mongo.db.collection('audit').insertOne({
    author: executedBy ? {
      _id: executedBy.id,
      wpUserId: executedBy.wpUserId,
      name: executedBy.name,
      email: executedBy.email
    } : null,
    action,
    context,
    occurred: new Date()
  })
}

/**
 * Add member detail when present in context.
 *
 * @param {*} events
 */
async function completeEventsContext(events) {
  const members = [] // Some sort of cache

  for (const event of events) {
    if (event.context?.memberId) {
      let member = members.find(member => member._id === event.context.memberId)
      if (!member) {
        const user = await Member.getUserById(event.context.memberId) // eslint-disable-line no-await-in-loop
        member = await Member.computeMemberFromUser(user) // eslint-disable-line no-await-in-loop
        members.push(member)
      }

      event.context.member = member
    }
  }
}

export async function getAllAuditEvents(from, to) {
  const events = await mongo.db.collection('audit')
    .find({
      ...((from || to) && {
        occurred: {
          ...(from && {$gte: from}),
          ...(to && {$lt: add(to, {days: 1})})
        }
      })
    })
    .sort({occurred: -1})
    .toArray()
  await completeEventsContext(events)
  return events
}

export async function getMemberAuditTrail(memberId) {
  const memberEvents = await mongo.db.collection('audit')
    .find({$or: [{'context.memberId': memberId}, {'author._id': memberId}]})
    .sort({occurred: -1})
    .toArray()
  await completeEventsContext(memberEvents)
  return memberEvents
}

/**
 * Récupère les événements d’audit selon des filtres optionnels.
 *
 * @param {Object} options - Options de filtrage
 * @param {Date} [options.from] - Date de début incluse (par défaut: il y a 31 jours)
 * @param {Date} [options.to] - Date de fin incluse (par défaut: maintenant)
 * @param {string} [options.action] - Action spécifique à filtrer
 * @returns {Promise<Array>} Liste des événements filtrés
 */
export async function getAuditEvents(options = {}) {
  const now = new Date()
  const defaultFrom = add(now, {days: -31})

  const from = options.from || defaultFrom
  const to = options.to || now
  const action = options.action || null

  // Construction du filtre
  const filter = {
    occurred: {
      $gte: from,
      $lt: add(to, {days: 1})
    }
  }

  if (action !== null) {
    filter.action = action
  }

  // Exécution de la requête
  const collection = mongo.db.collection('audit')

  // eslint-disable-next-line unicorn/no-array-callback-reference
  const cursor = collection.find(filter).sort({occurred: -1})

  const events = await cursor.toArray()
  await completeEventsContext(events)
  return events
}
