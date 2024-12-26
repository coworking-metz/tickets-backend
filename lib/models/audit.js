import mongo from '../util/mongo.js'
import * as Member from './member.js'

export async function logAuditTrail(author, action, context) {
  if (!action) {
    throw new Error('Audit trail action is required')
  }

  await mongo.db.collection('audit').insertOne({
    author: author ? {
      _id: author.id,
      wpUserId: author.wpUserId,
      name: author.name,
      email: author.email
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
          ...(to && {$lte: to})
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
