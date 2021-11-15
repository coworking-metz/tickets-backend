function checkKey(key) {
  if (!key) {
    throw new Error('API key not defined')
  }

  return (req, res, next) => {
    const authHeader = req.get('Authorization')

    if (authHeader) {
      if (authHeader === `Token ${key}`) {
        next()
      } else {
        res.status(403).send('Invalid API key')
      }

      return
    }

    if (req.method === 'POST' && req.body) {
      if (req.body.key === key) {
        next()
      } else {
        res.status(403).send('Invalid API key')
      }

      return
    }

    if (req.query.key) {
      if (req.query.key === key) {
        next()
      } else {
        res.status(403).send('Invalid API key')
      }

      return
    }

    res.status(401).send('Missing API key')
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
