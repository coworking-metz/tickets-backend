import mongo from '../../lib/util/mongo.js'

await mongo.connect()

const PRODUCT_TYPE = 'FREE_TICKET_FOR_EACH_MEMBERSHIP_BEFORE_2017_02_01'
const OLD_MEMBERSHIP_DATE = '2017-02-01'

try {
  console.log('Début de la migration : ajout d\'un ticket pour chaque ancienne adhésion.')

  // Supprimer les tickets existants avec le productType spécifique
  const deleteResult = await mongo.db.collection('tickets').deleteMany({
    productType: PRODUCT_TYPE
  })
  console.log(`Tickets correspondants supprimés : ${deleteResult.deletedCount}`)

  const oldMemberships = await mongo.db.collection('memberships').find({
    purchaseDate: {$lt: OLD_MEMBERSHIP_DATE}
  }).toArray()

  console.log(`Anciennes adhésions trouvées : ${oldMemberships.length}`)

  const operations = oldMemberships.map(membership => ({
    insertOne: {
      document: {
        memberId: membership.memberId,
        ticketsQuantity: 1,
        purchaseDate: membership.purchaseDate,
        orderReference: membership.orderReference,
        productType: PRODUCT_TYPE,
        price: 0
      }
    }
  }))

  if (operations.length > 0) {
    await mongo.db.collection('tickets').bulkWrite(operations)
    console.log('Migration terminée avec succès.')
  } else {
    console.log('Aucune ancienne adhésion trouvée.')
  }
} catch (error) {
  console.error('Erreur lors de la migration :', error)
} finally {
  await mongo.disconnect()
}
