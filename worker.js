import { join } from 'path';
import { createClient } from 'redis';
import ChainRegistry from './chainRegistry.js';
import HealthMonitor from './healthMonitor.js'

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

const health = HealthMonitor()
const registry = ChainRegistry(client)

async function queueHealthCheck(client) {
  setTimeout(() => {
    health.refreshApis(client, registry.getChains()).then(() => {
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

  await health.refreshApis(client, registry.getChains())
  if (REGISTRY_REFRESH_INTERVAL > 0) {
    queueHealthCheck(client)
  }
})();
