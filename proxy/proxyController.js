import proxyServer from "./server.js";
import compose from 'koa-compose'
import pathMatch from "path-match";

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

  function proxyOptions(key, ctx) {
    const regexp = new RegExp("\^\\/" + key, 'g');
    const response = {
      target: ctx.state.proxyUrl,
      changeOrigin: true,
      rewrite: path => path.replace(regexp, ''),
      events: {
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