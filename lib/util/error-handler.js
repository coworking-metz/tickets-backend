function errorHandler(err, req, res, _next) {
  if (err) {
    const statusCode = err.statusCode || 500
    const exposeError = statusCode !== 500

    res
      .status(statusCode)
      .send({
        status: statusCode,
        message: exposeError ? err.message : 'Une erreur inattendue est survenue.',
        code: err.code
      })

    if (statusCode === 500) {
      console.error(err)
    }
  }
}

export default errorHandler
