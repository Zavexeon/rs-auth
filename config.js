module.exports = {
    server: {
        keys: [process.env.COOKIE_KEY]
        , port: 3030
    }
    , spotify: {
        clientID: '75d33483e116485aa0dffc1d17a07444'
        , clientSecret: process.env.CLIENT_SECRET
        , redirectURI: 'https://rs-auth.replit.app/handle_auth'
    }
}