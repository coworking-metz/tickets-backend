import mongo from '../../lib/util/mongo.js'

await mongo.connect()

try {
  console.log('Début de la migration : migration des abos de la collection User vers la collection Subscriptions.')

  // Trouver tous les utilisateurs avec des abos
  const usersWithAbos = await mongo.db.collection('users').find({
    'profile.abos': {$exists: true, $ne: []} // Vérifie que le champ abos existe et n'est pas vide
  }).toArray()

  // Préparer les opérations d'insertion dans la collection subscriptions
  const subscriptionOperations = []

  for (const user of usersWithAbos) {
    const memberId = user._id
    const {abos} = user.profile

    for (const abo of abos) {
      // Exclure les abonnements dont la date d'achat est avant 2023
      if (new Date(abo.purchaseDate) > new Date('2023-01-01')) {
        continue
      }

      const existingSubscriptions = await mongo.db.collection('subscriptions').find({ // eslint-disable-line no-await-in-loop
        memberId,
        startDate: abo.aboStart,
        purchaseDate: abo.purchaseDate
      }).toArray()

      // Vérifier si un abonnement avec la même startDate et purchaseDate existe déjà
      if (existingSubscriptions.length === 0) {
        console.log(`Migration de l'abo pour l'utilisateur ${memberId} avec startDate ${abo.aboStart} et purchaseDate ${abo.purchaseDate}`)
        subscriptionOperations.push({
          insertOne: {
            document: {
              memberId,
              startDate: abo.aboStart,
              price: 60,
              purchaseDate: abo.purchaseDate,
              productType: 'subscription',
              orderReference: null,
              migratedFromUsersCollection: true,
              migratedAt: new Date().toISOString() // Ajoute une date de migration
            }
          }
        })
      }
    }
  }

  // Insérer les abos dans la collection subscriptions
  if (subscriptionOperations.length > 0) {
    const result = await mongo.db.collection('subscriptions').bulkWrite(subscriptionOperations)
    console.log(`Migration terminée : ${result.insertedCount} abonnements migrés vers la collection subscriptions.`)
  } else {
    console.log('Aucun abonnement à migrer.')
  }
} catch (error) {
  console.error('Erreur lors de la migration :', error)
} finally {
  await mongo.disconnect()
}
