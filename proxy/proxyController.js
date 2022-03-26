import proxyServer from "./server.js";
import compose from 'koa-compose'
import pathMatch from "path-match";
import koaCash from '../koaCache.js';
import safeStringify from 'fast-safe-stringify'

const CACHED_REQUESTS = {
  'cosmos/staking/v1beta1/validators': 5 * 60,
  'cosmos/authz/v1beta1/grants': 1 * 60
}

const ProxyController = (client, registry) => {
  const route = pathMatch({
    // path-to-regexp options
    sensitive: false,
    strict: false,
    end: false
  })

  function proxy(type){
    return compose([
      getChain(type),
      initCache(),
      serveCache,
      proxyServer("/:chain", (path, options) => proxyOptions(path.chain, options))
    ])
  }

  function getChain(type){
    return async (ctx, next) => {
      const match = route('/:chain')
      const params = match(ctx.path)
      const key = params?.chain
      const chain = key && await registry.getChain(key)
      const url = chain && await chain.apis.bestAddress(type)
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
    if(CACHED_REQUESTS.hasOwnProperty(path)){
      const maxAge = CACHED_REQUESTS[path]
      if (await ctx.cashed(maxAge)) return
    }
    return next()
  }

  function proxyOptions(key, ctx) {
    const regexp = new RegExp("\^\\/" + key, 'g');
    const response = {
      target: ctx.state.proxyUrl,
      changeOrigin: true,
      proxyTimeout: 30 * 1000,
      rewrite: path => path.replace(regexp, ''),
      headers: {
        'accept-encoding': '*;q=1,gzip=0'
      },
      events: {
        proxyRes: (proxyRes, req, res) => {
          var body = [];
          proxyRes.on('data', function(chunk) {
            body.push(chunk);
          });
      
          proxyRes.on('end', function() {
            res.rawBody = Buffer.concat(body).toString()
          });
        },
        error: (err, req, res) => {
          res.writeHead(500, {
            'Content-Type': 'text/plain'
          });
          res.end('Something went wrong: ' + err.message);
        }
      }
    }
    return response
  }

  return {
    proxy
  }
}

export default ProxyController;