function checkKey(key) {
  if (!key) {
    throw new Error('API key not defined')
  }

  return (req, res, next) => {
    if (req.body.key !== key && req.query.key !== key) {
      return res.status(403).send('Invalid API key.\n')
    }

    next()
  }
}

module.exports = {checkKey}
