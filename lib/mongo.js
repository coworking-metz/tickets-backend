const {MongoClient, ObjectId} = require('mongodb')

class Mongo {
  async connect(connectionString) {
    this.client = new MongoClient(connectionString || process.env.MONGODB_URL || 'mongodb://localhost:27017')
    await this.client.connect()
    this.db = this.client.db(process.env.MONGODB_DBNAME || 'tickets')
  }

  disconnect(force) {
    if (this.client && this.client.isConnected()) {
      return this.client.close(force)
    }
  }
}

module.exports = new Mongo()
module.exports.ObjectId = ObjectId
