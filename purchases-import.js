import * as Purchases from './lib/models/purchase.js'
import mongo from './lib/util/mongo.js'

try {
  await mongo.connect()
  await Purchases.deleteImportedPurchases()

  const years = Purchases.getYears()
  for (const year of years) {
    await Purchases.importPurchases(year) // eslint-disable-line no-await-in-loop
  }
} catch (error) {
  console.error('An error occurred:', error)
} finally {
  await mongo.disconnect()
  console.log('End of purchases import.')
}
