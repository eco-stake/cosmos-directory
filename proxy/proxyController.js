import proxyServer from "./server.js";

const ProxyController = (client, registry) => {
  function proxy(type){
    return proxyServer("/:chain", (path, options) => proxyOptions(path.chain, type, path, options))
  }

  async function proxyOptions(key, type, path, options) {
    const chain = await registry.getChain(key)
    const url = chain && await chain.apis.bestAddress(type)
    options.res.locals = { chainExists: !!chain, urlExists: !!url }
    const regexp = new RegExp("\^\\/" + key, 'g');
    const response = {
      target: 'https://cosmos.directory',
      changeOrigin: true,
      rewrite: path => path.replace(regexp, ''),
      events: {
        proxyReq: (proxyReq, req, res) => {
          const { chainExists, urlExists } = res.locals
          if (!chainExists) {
            res.writeHead(404, {
              'Content-Type': 'text/plain'
            });
            return res.end('Not found');
          } else if (!urlExists) {
            res.writeHead(502, {
              'Content-Type': 'text/plain'
            });
            return res.end('No servers available');
          }
        },
        error: (err, req, res) => {
          res.writeHead(500, {
            'Content-Type': 'text/plain'
          });
          res.end('Something went wrong: ' + err.message);
        }
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