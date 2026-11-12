import process from 'node:process'
import {MongoClient} from 'mongodb'

class Mongo {
  async connect(connectionString) {
    this.client = new MongoClient(connectionString || process.env.MONGODB_URL || 'mongodb://localhost:27017')
    await this.client.connect()
    this.db = this.client.db(process.env.MONGODB_DBNAME || 'tickets')
    await this.createIndexes()
  }

  async createIndexes() {
    await this.db.collection('users').createIndex({email: 1}, {unique: true, sparse: true})
    await this.db.collection('users').createIndex({wpUserId: 1}, {unique: true, sparse: true})

    await this.db.collection('devices').createIndex({macAddress: 1}, {unique: true})
    await this.db.collection('devices').createIndex({member: 1})
    await this.db.collection('devices').createIndex({heartbeat: 1})

    await this.db.collection('member_activity').createIndex({member: 1, date: 1}, {unique: true})
    await this.db.collection('member_activity').createIndex({date: 1})
    await this.db.collection('member_activity').createIndex({member: 1})

    await this.db.collection('subscriptions').createIndex({memberId: 1})
    await this.db.collection('subscriptions').createIndex({startDate: 1, endDate: 1})
    await this.db.collection('subscriptions').createIndex({purchaseDate: 1})

    await this.db.collection('tickets').createIndex({memberId: 1, purchaseDate: 1})
    await this.db.collection('tickets').createIndex({purchaseDate: 1})

    await this.db.collection('memberships').createIndex({memberId: 1})
    await this.db.collection('memberships').createIndex({purchaseDate: 1})
  }

  disconnect(force) {
    if (this.client) {
      const {client} = this
      this.client = null
      return client.close(force)
    }
  }
}

const mongo = new Mongo()
export default mongo
