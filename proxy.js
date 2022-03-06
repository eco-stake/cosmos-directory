const Koa = require("koa");
const Subdomain = require('koa-subdomain');
const Router = require('koa-router');
const cors = require("@koa/cors");
const proxy = require("koa-proxies");
const _ = require("lodash");
const path = require('path')
const ChainRegistry = require('./chainRegistry')

const dir = path.join(process.cwd(), '../chain-registry')
const registry = ChainRegistry(dir)

const intervals = {}
const currentUrls = {}
let chains = {}

function updateChains(){
  return registry.refresh().then(newChains => {
    chains = newChains
    Object.keys(chains).forEach(key => {
      updateApis(key)
      clearInterval(intervals[key])
      intervals[key] = setInterval(() => {
        updateApis(key)
      }, 10_000)
    })
    return chains
  })
}

function updateApis(key){
  const chain = chains[key]
  chain.apis.refreshUrls()
}

function loadBalanceProxy(key, type, options, params, ctx){
  const chain = chains[key]
  const url = chain && chain.apis.bestUrl(type)
  const regexp = new RegExp("\^\\/"+key, 'g');
  const response = {
    changeOrigin: true,
    rewrite: path => path.replace(regexp, ''),
    target: 'https://cosmos.directory',
    events: {
      proxyReq: (proxyReq, req, res) => {
        if(!chain){
          console.log('no chain')
          res.writeHead(404, {
            'Content-Type': 'text/plain'
          });
          return res.end('Not found');
        }
        if(!url){
          console.log('no url')
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
const registryInterval = setInterval(updateChains, 60_000 * 30)

const port = process.env.PORT || 3000;
const app = new Koa();
const router = new Router();
const subdomain = new Subdomain();

subdomain.use('rest', proxy("/:chain", (req, res, ctx) => loadBalanceProxy(req.chain, 'rest', req, res, ctx)));
subdomain.use('rpc', proxy("/:chain", (req, res, ctx) => loadBalanceProxy(req.chain, 'rpc', req, res, ctx)));

router.get('/', (ctx, next) => {
  renderJson(ctx, Object.keys(chains))
});

router.get('/:chain', (ctx, next) => {
  const chain = chains[ctx.params.chain]
  renderJson(ctx, chain && chain.chain)
});

router.get('/:chain/assetlist', (ctx, next) => {
  const chain = chains[ctx.params.chain]
  renderJson(ctx, chain && chain.assetlist)
});

subdomain.use('registry', router.routes());

app.use(cors());

app.use(subdomain.routes());

app.listen(port);
console.log(`listening on port ${port}`);
