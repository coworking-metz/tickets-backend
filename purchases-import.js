import * as Purchases from './lib/models/purchases.js'
import mongo from './lib/util/mongo.js'

try {
  await mongo.connect()
  await Purchases.deleteImportedPurchases()

  const years = Purchases.getYears()
  for (const year of years) {
    await Purchases.importPurchases(year)
  }
} catch (error) {
  console.error('An error occurred:', error)
} finally {
  await mongo.disconnect()
  console.log('End of purchases import.')
}
