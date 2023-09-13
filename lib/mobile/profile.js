const getUserProfile = async (req, res) => {
  res.send(req.user)
}

module.exports = {getUserProfile}
