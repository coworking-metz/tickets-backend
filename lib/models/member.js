import mongo from '../utils/mongo.js'

export async function getUserByWordpressId(wordpressId) {
  return mongo.db.collection('users').findOne({wpUserId: wordpressId})
}

export async function getUserByEmail(email) {
  return mongo.db.collection('users').findOne({
    emails: {$elemMatch: {address: email}}
  })
}

export async function getUserById(id) {
  return mongo.db.collection('users').findOne({_id: id})
}
