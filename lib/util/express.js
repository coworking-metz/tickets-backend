export function getServerBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`
}
