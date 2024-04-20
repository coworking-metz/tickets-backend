import * as Purchase from './lib/models/purchase.js'
import * as Migration from './lib/migration/migration.js'
import mongo from './lib/util/mongo.js'
import process from 'node:process'

const mode = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'full'
let years = process.argv.find(arg => arg.startsWith('--years='))?.split('=')[1]
years = years ? years.split(',') : Purchase.getYears()

try {
  await mongo.connect()

  if (mode === 'full' || mode === 'migrate') {
    await Migration.migratePurchasesToCollections()
  }

  if (mode === 'full' || mode === 'orders') {
    for (const year of years) {
      await Migration.importOrdersForYear(year) // eslint-disable-line no-await-in-loop
    }
  }
} catch (error) {
  console.error('An error occurred:', error)
} finally {
  await mongo.disconnect()
  console.log('End of purchases import.')
}
