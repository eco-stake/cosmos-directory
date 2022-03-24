import { join } from 'path';
import { createClient } from 'redis';
import ChainRegistry from './chainRegistry.js';
import ChainApis from './chainApis.js';
import HealthMonitor from './healthMonitor.js'
import { timeStamp } from './utils.js';

const dir = join(process.cwd(), '../chain-registry')
const url = process.env.REGISTRY_URL
const branch = process.env.REGISTRY_BRANCH
const refreshSeconds = parseInt(process.env.REGISTRY_REFRESH || 1800)
const healthSeconds = parseInt(process.env.HEALTH_REFRESH || 15)
const REGISTRY_REFRESH_INTERVAL = 1000 * refreshSeconds
const HEALTH_REFRESH_INTERVAL = 1000 * healthSeconds

console.log("Using config:", {
  dir,
  url,
  branch,
  refreshSeconds,
  healthSeconds
})

const registry = ChainRegistry(dir, url, branch)
const monitor = HealthMonitor()

const refreshApis = async (client) => {
  timeStamp('Refreshing APIs');
  await Promise.all([...registry.getChains()].map(async chain => {
    const apis = ChainApis(client, chain.chainId, chain.apis || {})
    await Promise.all(['rpc', 'rest'].map(async type => {
      const urls = apis.apis[type] || [];
      const current = await apis.current(type)
      const updated = await Promise.all([...urls].map(async url => {
        if (monitor.pending(url.address)) return
  
        const currentUrl = current[url.address]
        return await monitor.checkUrl(url, type, chain.chainId, { ...currentUrl })
      }));
      await client.json.set('health:' + chain.chainId, '$.' + type, updated.reduce((sum, url) => {
        if(!url) return sum
        sum[url.url.address] = url
        return sum
      }, {}))
    }));
  }))
  timeStamp('Refreshed APIs');
}

async function queueHealthCheck(client) {
  setTimeout(() => {
    refreshApis(client).then(() => {
      queueHealthCheck(client)
    })
  }, HEALTH_REFRESH_INTERVAL)
}

(async () => {
  const client = createClient({
    url: 'redis://redis:6379'
  });

  client.on('error', (err) => console.log('Redis Client Error', err));

  await client.connect();

  await registry.refresh()
  setInterval(() => registry.refresh(), REGISTRY_REFRESH_INTERVAL)
  await refreshApis(client)
  if (REGISTRY_REFRESH_INTERVAL > 0) {
    queueHealthCheck(client)
  }
})();
