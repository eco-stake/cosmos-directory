const Koa = require("koa");
const Subdomain = require('koa-subdomain');
const Router = require('koa-router');
const cors = require("@koa/cors");
const proxy = require("koa-proxies");
const axios = require("axios");
const _ = require("lodash");
const subdomain = new Subdomain();

const app = new Koa();
const port = process.env.PORT || 3000;

const networks = {
  akash: {
    chainId: 'akashnet-2',
    restUrls: [
      "http://135.181.60.250:1317",
      "http://135.181.181.120:1518",
      "http://135.181.181.119:1518",
      "http://135.181.181.121:1518",
      "http://135.181.181.122:1518",
      "http://135.181.181.123:1518"
    ],
    rpcUrls: [
      "http://135.181.60.250:26657",
      "http://rpc.akash.forbole.com:80",
      "http://akash-sentry01.skynetvalidators.com:26657",
      "https://akash.technofractal.com:443",
      "http://162.55.94.246:28957",
      "http://135.181.181.120:28957",
      "http://135.181.181.119:28957",
      "http://135.181.181.121:28957",
      "http://135.181.181.122:28957",
      "http://135.181.181.123:28957"
    ]
  },
  regen: {
    chainId: 'regen-1',
    restUrls: [
      "http://public-rpc.regen.vitwit.com:1317",
      "https://regen.stakesystems.io"
    ],
    rpcUrls: [
      "http://public-rpc.regen.vitwit.com:26657",
      "https://regen.stakesystems.io:2053",
      "http://rpc.regen.forbole.com:80"
    ]
  },
  terra: {
    chainId: 'columbus-5',
    restUrls: [
      "http://64.227.72.101:1317",
      "https://blockdaemon-terra-lcd.api.bdnodes.net:1317"
    ],
    rpcUrls: [
      "https://terra-rpc.easy2stake.com:443",
      "http://64.227.72.101:26657",
      "http://public-node.terra.dev:26657",
      "https://terra.technofractal.com:443"
    ]
  }
}

const intervals = {}
const currentUrls = {}
const urlTypes = ['rest', 'rpc']

function findNetworkUrls(key, network, type){
  const path = type === 'rest' ? 'node_info' : 'status'
  return findAvailableUrls(network[type + 'Urls'], path, data => {
    switch(type){
      case 'rest':
        return data.node_info.network === network['chainId']
        break;
      case 'rpc':
        return data.result.node_info.network === network['chainId']
        break;
      default:
        return false
    }
  }).then(urls => {
    currentUrls[key][type] = urls
  })
}

function findAvailableUrls(urls, path, callback){
  return filterAsync(urls, (url) => {
    return axios.get(url + '/' + path, {timeout: 2000})
      .then(res => res.data)
      .then(data => {
        return callback(data)
      }).catch(error => {
        return false
      })
  })
}

function mapAsync(array, callbackfn) {
  return Promise.all(array.map(callbackfn));
}

function filterAsync(array, callbackfn) {
  return mapAsync(array, callbackfn).then(filterMap => {
    return array.filter((value, index) => filterMap[index]);
  });
}

Object.keys(networks).forEach(key => {
  currentUrls[key] = currentUrls[key] || {
    rpc: [],
    rest: []
  }
  const network = networks[key]
  urlTypes.forEach(type => {
    findNetworkUrls(key, network, type).then(function(){
      intervals[key] = setInterval(() => {
        findNetworkUrls(key, network, type)
      }, 5_000)
    })
  })
})

var currentServer = 1;
function loadBalanceProxy(key, type, req, res, ctx){
  const cur = currentServer % currentUrls[key][type].length;
  currentServer++;
  const target = currentUrls[key][type][cur];
  const regexp = new RegExp("\^\\/"+key, 'g');
  return {
    target: target,
    changeOrigin: true,
    rewrite: path => path.replace(regexp, ''),
    logs: true,
  }
}

subdomain.use('rest', proxy("/:network", (req, res, ctx) => loadBalanceProxy(req.network, 'rest', req, res, ctx)));
subdomain.use('rpc', proxy("/:network", (req, res, ctx) => loadBalanceProxy(req.network, 'rpc', req, res, ctx)));

app.use(cors());

app.use(subdomain.routes());

app.listen(port);
console.log(`listening on port ${port}`);
