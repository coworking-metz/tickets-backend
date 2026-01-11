import mongo from '../../lib/util/mongo.js'

const PRODUCT_TYPE = 'FREE_TICKET_FOR_ACTIVITY_BEFORE_2017_02_01'
const DATE = '2017-02-01'

await mongo.connect()

try {
  console.log(`Début de la migration : ajout d'un ticket pour les membres actifs avant le ${DATE}.`)

  // Supprimer les tickets existants avec le productType spécifique
  const deleteResult = await mongo.db.collection('tickets').deleteMany({
    productType: PRODUCT_TYPE
  })
  console.log(`Tickets supprimés : ${deleteResult.deletedCount}`)

  const usersWithPresence = await mongo.db.collection('member_activity').aggregate([
    {
      $match: {
        date: {$lt: DATE}
      }
    },
    {
      $group: {
        _id: '$member'
      }
    }
  ]).toArray()

  console.log(`Membres actifs avant le ${DATE} : ${usersWithPresence.length}`)

  const operations = usersWithPresence.map(user => ({
    insertOne: {
      document: {
        memberId: user._id,
        ticketsQuantity: 1,
        purchaseDate: DATE,
        orderReference: null,
        productType: PRODUCT_TYPE,
        price: 0
      }
    }
  }))

  if (operations.length > 0) {
    await mongo.db.collection('tickets').bulkWrite(operations)
    console.log('Migration terminée avec succès.')
  } else {
    console.log('Aucun membre concerné.')
  }
} catch (error) {
  console.error('Erreur lors de la migration :', error)
} finally {
  await mongo.disconnect()
}
