import ChainApis from "../chain/chainApis.js";
import proxyServer from "./server.js";

const ProxyController = (client, registry) => {
  function proxy(type){
    return proxyServer("/:chain", (path, options) => loadBalanceProxy(path.chain, type, path, options))
  }

  async function loadBalanceProxy(key, type, path, options) {
    const chain = await registry.getChain(key)
    const apis = chain && ChainApis(client, chain.chainId, chain.apis)
    const url = apis && await apis.bestAddress(type)
    options.res.locals = {
      chain, url
    }
    const regexp = new RegExp("\^\\/" + key, 'g');
    const response = {
      changeOrigin: true,
      rewrite: path => path.replace(regexp, ''),
      target: 'https://cosmos.directory',
      events: {
        proxyReq: (proxyReq, req, res) => {
          const chain = res.locals.chain
          const url = res.locals.url
          if (!chain) {
            res.writeHead(404, {
              'Content-Type': 'text/plain'
            });
            return res.end('Not found');
          } else if (!url) {
            res.writeHead(502, {
              'Content-Type': 'text/plain'
            });
            return res.end('No servers available');
          }
        },
      }
    }

    if (url) {
      response.target = url
      // response.logs = true
    }

    return response
  }

  return {
    proxy
  }
}

export default ProxyController;