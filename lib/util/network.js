async function ip(req = false) {


    if (req) {

        // 'x-forwarded-for' may return multiple IP addresses in the format: 
        // "client IP, proxy 1 IP, proxy 2 IP", so we take the first one
        const forwardedFor = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();

        return forwardedFor ||
            req.headers['x-real-ip'] ||
            req.headers['x-client-ip'] ||
            req.headers['cf-connecting-ip'] ||
            (req.connection && req.connection.remoteAddress) ||
            undefined;
    } else {
        return await getPublicIp();
    }
}


const got = require('got');

async function getPublicIp() {
    const response = await got('https://api.ipify.org?format=json');
    const data = JSON.parse(response.body);
    return data.ip;
}

module.exports = { ip }