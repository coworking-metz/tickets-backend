function checkKey(key) {
  if (!key) {
    throw new Error('API key not defined')
  }

  return (req, res, next) => {
    if ((req.body && req.body.key !== key) && req.query.key !== key) {
      return res.status(403).send('Invalid API key.\n')
    }

    next()
  }
}

function ensureAdmin(req, res, next) {
  if (!req.user) {
    return res.sendStatus(401)
  }

  if (!req.user.isAdmin) {
    return res.sendStatus(403)
  }

  next()
}

module.exports = {checkKey, ensureAdmin}
