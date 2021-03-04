// Simple wrapper Express permettant d'utiliser la syntaxe async/await

module.exports = function (handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next)
    } catch (error) {
      next(error)
    }
  }
}
