const Koa = require("koa");
const Subdomain = require('koa-subdomain');
const Router = require('koa-router');
const cors = require("@koa/cors");
const proxy = require("koa-proxies");
const _ = require("lodash");
const path = require('path')
const ChainRegistry = require('./chainRegistry')

const dir = path.join(process.cwd(), '../chain-registry')
const url = process.env.REGISTRY_URL
const branch = process.env.REGISTRY_BRANCH
const refreshSeconds = parseInt(process.env.REGISTRY_REFRESH || 1800)

console.log("Using config:", {
  dir,
  url,
  branch,
  refreshSeconds
})

const REGISTRY_REFRESH_INTERVAL = 1000 * refreshSeconds
const registry = ChainRegistry(dir, branch)

const intervals = {}

function updateChains(){
  Object.keys(intervals).forEach(key => {
    clearInterval(intervals[key])
    delete intervals[key]
  })
  return registry.refresh().then(() => {
    registry.chainNames().forEach(key => {
      updateApis(key)
      intervals[key] = setInterval(() => {
        updateApis(key)
      }, 15_000)
    })
  })
}

function updateApis(key){
  const chain = registry.getChain(key)
  chain.apis.refreshUrls()
}

function loadBalanceProxy(key, type, path, options){
  const chain = registry.getChain(key)
  const url = chain && chain.apis.bestUrl(type)
  options.res.locals = {
    chain, url
  }
  const regexp = new RegExp("\^\\/"+key, 'g');
  const response = {
    changeOrigin: true,
    rewrite: path => path.replace(regexp, ''),
    target: 'https://cosmos.directory',
    events: {
      proxyReq: (proxyReq, req, res) => {
        const chain = res.locals.chain
        const url = res.locals.url
        if(!chain){
          res.writeHead(404, {
            'Content-Type': 'text/plain'
          });
          return res.end('Not found');
        }else if(!url){
          res.writeHead(502, {
            'Content-Type': 'text/plain'
          });
          return res.end('No servers available');
        }
      },
    }
  }

  if(url){
    response.target = url
    response.logs = true
  }

  return response
}

function renderJson(ctx, object){
  if(object){
    ctx.body = object
  }else{
    ctx.status = 404
    ctx.body = 'Not found'
  }
}

updateChains()
if(REGISTRY_REFRESH_INTERVAL > 0){
  setInterval(updateChains, REGISTRY_REFRESH_INTERVAL)
}

const port = process.env.PORT || 3000;
const app = new Koa();
const router = new Router();
const subdomain = new Subdomain();

app.use(cors());

subdomain.use('rest', proxy("/:chain", (path, options) => loadBalanceProxy(path.chain, 'rest', path, options)));
subdomain.use('rpc', proxy("/:chain", (path, options) => loadBalanceProxy(path.chain, 'rpc', path, options)));

router.get('/', (ctx, next) => {
  renderJson(ctx, registry.getChains().map(chain => {
    return chain.summary()
  }))
});

router.get('/:chain', (ctx, next) => {
  const chain = registry.getChain(ctx.params.chain)
  renderJson(ctx, chain && chain.summary())
});

router.get('/:chain/chain', (ctx, next) => {
  const chain = registry.getChain(ctx.params.chain)
  renderJson(ctx, chain && chain.chain)
});

router.get('/:chain/assetlist', (ctx, next) => {
  const chain = registry.getChain(ctx.params.chain)
  renderJson(ctx, chain && chain.assetlist)
});

subdomain.use('registry', router.routes());

app.use(subdomain.routes());

app.listen(port);
console.log(`listening on port ${port}`);
