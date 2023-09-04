const getUserProfile = async (req, res, next) => {
  res.send(req.user)
}

module.exports = {getUserProfile}
