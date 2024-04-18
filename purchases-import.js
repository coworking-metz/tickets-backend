import * as Purchases from './lib/models/purchase.js'
import mongo from './lib/util/mongo.js'

try {
  await mongo.connect()
  await Purchases.deleteImportedPurchases()

  const years = Purchases.getYears()
  for (const year of years) {
    // eslint-disable-next-line
    await Purchases.importPurchases(year)
  }
} catch (error) {
  console.error('An error occurred:', error)
} finally {
  await mongo.disconnect()
  console.log('End of purchases import.')
}
