const got = require('got')

async function ouvrirPortail(req) {
    if (process.env.INTERPHONE_URL) {
        await got.post(process.env.INTERPHONE_URL)
    }
    historiquePortail(req);
}

async function historiquePortail(req) {
    let historique = {
        date: new Date(),
    };
    if (req.session.user) {
        historique.user = req.session.user.login;
        historique.user_id = req.session.user.id;
    } else {
        historique.ip = await ip();
    }
    await mongo.db.collection('historique-portail').insertOne(historique);

}
module.exports = { ouvrirPortail }