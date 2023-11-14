const Koa       = require('koa'),
      Router    = require('koa-router'),
      session   = require('koa-session'),
      config    = require('./config.js'),
      ratelimit = require('koa-ratelimit'),
      crypto    = require('crypto')

const app    = new Koa(),
      router = new Router()
      rldb   = new Map()

app.keys = config.server.keys

app.use(ratelimit({
    driver: 'memory'
    , db: rldb
    , duration: 600000
    , errorMessage: 'Rate Limit Exceeded'
    , id: ctx => ctx.ip
    , max: 10000
}))

/* setup session cookies */
app.use(session({
    key: 'replify.auth.session'
    , maxAge: 900000
}, app))

/* generates a pseudo-random number of a fixed length */
const generateFixedLengthNumber = length => {
    const numberArray = []
    for (let i = 0; i < length; i++) {
        numberArray.push(
            i === 0 ? 
            Math.floor(Math.random() * 9) + 1 :
            Math.floor(Math.random() * 10)
        )
    }
    return Number(numberArray.join(''))
}

/* generates a pseudo-random state encoded to Base64 */
const generateState = () => Buffer.from(String(generateFixedLengthNumber(8) + Date.now())).toString('base64')

const apiPostForm = async (endpoint, body) => {
    return await fetch('https://accounts.spotify.com/api' + endpoint, {
        method: 'post'
        , headers: {
            'Authorization': 'Basic ' + Buffer.from(`${config.spotify.clientID}:${config.spotify.clientSecret}`).toString('base64')
            , 'Content-Type': 'application/x-www-form-urlencoded'
            }
            , body: body
    })
}

let uuidData = {
    /* uuid: { 
        authed: false
        expires: <ms>
        state: state
        authData: {
            ...
        }
    } */
}

setTimeout(() => {
    for (let uuid in uuidData) {
        if (uuidData[uuid].expires <= Date.now()) delete uuidData[uuid]
    }
}, 10000)

router.get('/', ctx => { 
    ctx.status = 308
    ctx.redirect('https://replit.com/extension/@Zavexeon/e084710b-7cbe-45eb-ba0a-23e9c8731467')
})

router.get('/login', ctx => {
    if (uuidData[ctx.query.uuid]) {
        const state = generateState()
        
        ctx.session.state = state
        ctx.session.uuid = ctx.query.uuid
    
        const query = new URLSearchParams({
            client_id: '75d33483e116485aa0dffc1d17a07444'
            , response_type: 'code'
            , redirect_uri: config.spotify.redirectURI
            , state: state
            , scope: [
                'user-read-currently-playing'
                , 'user-modify-playback-state' 
                , 'user-read-playback-state'
                , 'user-read-private'
            ].join(' ')
        })

        ctx.status = 308
        return ctx.redirect(`https://accounts.spotify.com/authorize?${query}`)
    } else {
        ctx.status = 403
        ctx.body = { error: 'invalid uuid specified' }
    }
})

router.get('/handle_auth', async ctx => {
    if (ctx.query.code && ctx.query.state) {
        if (ctx.query.state === ctx.session.state) {
            const response = await apiPostForm('/token', `grant_type=authorization_code&code=${encodeURIComponent(ctx.query.code)}&redirect_uri=${encodeURIComponent(config.spotify.redirectURI)}`)
            
            if (response.status === 200) {
                uuidData[ctx.session.uuid].authData = await response.json()
                uuidData[ctx.session.uuid].authed = true
                
                ctx.status = 308
                return ctx.redirect('/success')
            } else {
                ctx.status = 401
                ctx.body = { error: 'failed to retrieve token'}
            }
        } else {
            ctx.status = 403
            ctx.body = { error: 'states do not match' }
        }
    } else {
        ctx.status = 403
        ctx.body = { error: 'missing required queries in URI'}
    }
})

router.get('/success', ctx => {
    ctx.status = 200
    ctx.body = 'You have been succesfully authenticated! You may close this tab and return to the original application. :)'
})

router.get('/get_refresh_token', async ctx => {
    ctx.set('Access-Control-Allow-Origin', '*')
    if (ctx.query.refresh_token) {
         const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'post'
            , headers: {
                'Authorization': 'Basic ' + Buffer.from(`${config.spotify.clientID}:${config.spotify.clientSecret}`).toString('base64')
                , 'Content-Type': 'application/x-www-form-urlencoded'
            }
            , body: `grant_type=refresh_token&refresh_token=${ctx.query.refresh_token}`
        })

        const body = await response.json()
        if (response.status = 200) {
            ctx.status = 200
            ctx.body = body
        } else {
            ctx.status = 401
            ctx.body = { error: 'failed to retrieve refresh token'}
        }
    } else {
        ctx.status = 403
        ctx.body = { error: 'missing requiired queries in URI'}
    }
})

router.get('/get_new_id/:state', ctx => {
    ctx.set('Access-Control-Allow-Origin', '*')
    const newUuid = Buffer.from(crypto.randomUUID()).toString('base64')
    uuidData[newUuid] = { 
        expires: Date.now() + 600000
        , clientURL: ctx.request.host
        , authed: false
        , state: ctx.params.state
    }
    ctx.body = { uuid: newUuid }
})

router.get('/retrieve_auth_data/:uuid/:state', ctx => {
    ctx.set('Access-Control-Allow-Origin', '*')
    if (uuidData[ctx.params.uuid] && uuidData[ctx.params.uuid].state === ctx.params.state && uuidData[ctx.params.uuid].authed) {
        ctx.status = 200
        ctx.body = uuidData[ctx.params.uuid].authData
        delete uuidData[ctx.params.uuid]
    } else {
        ctx.status = 403
        ctx.body = { error: 'invalid uuid' }
    }
})

app.use(router.routes())
app.listen(config.server.port, () => console.log(`Server listening on port ${config.server.port}.`))