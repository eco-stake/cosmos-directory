import compose from 'koa-compose'
import pathMatch from "path-match";
import Agent from 'agentkeepalive'
import httpProxy from 'http-proxy';
import safeStringify from 'fast-safe-stringify'
import koaCash from '../lib/koaCache.js';
import { debugLog } from '../utils.js';

const { createProxyServer } = httpProxy;

const CACHED_REQUESTS = [ 
  {
    path: 'cosmos/staking/v1beta1/validators',
    maxAge: 5 * 60
  },
  {
    path: 'cosmos/authz/v1beta1/grants',
    maxAge: 1 * 60
  },
  {
    path: new RegExp("cosmos/staking/v1beta1/delegations/[\\w\\d]*$"),
    maxAge: 30
  },
  {
    path: new RegExp("cosmos/bank/v1beta1/balances/[\\w\\d]*$"),
    maxAge: 30
  },
  {
    path: new RegExp("cosmos/distribution/v1beta1/delegators/[\\w\\d]*/rewards$"),
    maxAge: 30
  },
  {
    path: new RegExp("/cosmos/staking/v1beta1/validators/[\\w\\d]*/delegations$"),
    maxAge: 60
  },
  {
    path: new RegExp("/cosmos/distribution/v1beta1/delegators/[\\w\\d]*/withdraw_address$"),
    maxAge: 5 * 60
  },
  {
    path: 'osmosis/mint/v1beta1/params',
    maxAge: 60 * 60
  },
  {
    path: 'osmosis/epochs/v1beta1/epochs',
    maxAge: 5 * 60
  },
  {
    path: 'osmosis/mint/v1beta1/epoch_provisions',
    maxAge: 5 * 60
  }
 ]

const ProxyController = (client, registry) => {
  const proxy = createProxyServer()

  proxy.on('proxyRes', (proxyRes, req, res) => {
    var body = [];
    proxyRes.on('data', function (chunk) {
      body.push(chunk);
    });

    proxyRes.on('end', function () {
      res.rawBody = Buffer.concat(body).toString()
    });
  })

  proxy.on('error', (err, req, res) => {
    res.writeHead(500, {
      'Content-Type': 'text/plain'
    });
    res.end('Something went wrong: ' + err.message);
  })

  const httpAgent = new Agent();
  const httpsAgent = new Agent.HttpsAgent();

  const route = pathMatch({
    sensitive: false,
    strict: false,
    end: false
  })

  function routes(type){
    return compose([
      getChain(type),
      initCache(),
      serveCache,
      proxyRequest
    ])
  }

  function getChain(type){
    return async (ctx, next) => {
      const match = route('/:chain')
      const params = match(ctx.path)
      const chainName = params?.chain
      const chain = chainName && await registry.getChain(chainName)
      const apis = chain && await chain.apis(type)
      const url = apis.bestAddress(type)
      if (!chain) {
        ctx.res.writeHead(404, {
          'Content-Type': 'text/plain'
        });
        return ctx.res.end('Chain not found');
      } else if (!url) {
        ctx.res.writeHead(502, {
          'Content-Type': 'text/plain'
        });
        return ctx.res.end('No servers available');
      }
      ctx.state.chainName = chainName
      ctx.state.proxyUrl = url
      return next()
    }
  }

  function initCache(){
    return koaCash({
      maxAge: 60,
      setCachedHeader: true,
      compression: true,
      async get(key) {
        let value;
        try {
          value = await client.get('cache:'+key);
          if (value) value = JSON.parse(value);
        } catch (err) {
          console.error(err);
        }

        return value;
      },
      set(key, value, maxAge) {
        if (maxAge <= 0) return client.setEx('cache:'+key, 60, safeStringify(value));
        return client.setEx('cache:'+key, maxAge, safeStringify(value));
      }
    })
  }

  async function serveCache(ctx, next){
    let { path } = ctx.request;
    path = path.split('/').slice(2).join('/')
    const match = CACHED_REQUESTS.find(el => path.match(el.path))
    if(match){
      if (await ctx.cashed(match.maxAge)){
        debugLog('Using cache', path)
        return
      }
      debugLog('Caching', path)
    }else{
      debugLog('Skipping cache', path)
    }
    return next()
  }

  async function proxyRequest(ctx, next){
    const chainName = ctx.state.chainName
    if (!chainName) return next()

    const url = new URL(ctx.state.proxyUrl)

    return new Promise((resolve) => {
      const opts = {
        target: ctx.state.proxyUrl,
        changeOrigin: true,
        proxyTimeout: 30 * 1000,
        timeout: 30 * 1000,
        xfwd: true,
        secure: false,
        followRedirects: true,
        agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
        headers: {
          'accept-encoding': '*;q=1,gzip=0'
        }
      }
      ctx.req.oldPath = ctx.req.url
      const regexp = new RegExp("\^\\/" + chainName, 'g');
      ctx.req.url = ctx.req.url.replace(regexp, '')

      ctx.res.on('close', () => { 
        resolve()
      })

      ctx.res.on('finish', () => { 
        resolve()
      })

      proxy.web(ctx.req, ctx.res, opts, e => {
        const status = {
          ECONNREFUSED: 503,
          ETIMEOUT: 504
        }[e.code];
        ctx.status = status || 500;
        resolve()
      })
    })
  }

  return {
    routes
  }
}

export default ProxyController;