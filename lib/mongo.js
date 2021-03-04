const {MongoClient, ObjectID} = require('mongodb')

class Mongo {
  async connect(connectionString) {
    this.client = await MongoClient.connect(connectionString || process.env.MONGODB_URL || 'mongodb://localhost:27017', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    this.db = this.client.db(process.env.MONGODB_DBNAME || 'tickets')
  }

  disconnect(force) {
    if (this.client && this.client.isConnected()) {
      return this.client.close(force)
    }
  }
}

module.exports = new Mongo()
module.exports.ObjectID = ObjectID
