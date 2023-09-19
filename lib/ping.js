import mongo from './util/mongo.js'

export async function ping(req, res) {
  try {
    await mongo.db.command({ping: 1})
    res.send({status: 'up'})
  } catch (error) {
    console.log(error)
    res.send({status: 'down'})
  }
}
