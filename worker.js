import ChainRegistry from './chainRegistry/chainRegistry.js';
import Repository from './repository/repository.js';
import HealthMonitor from './status/healthMonitor.js';
import { redisClient } from "./redisClient.js";

const url = process.env.REGISTRY_URL
const branch = process.env.REGISTRY_BRANCH
const refreshSeconds = parseInt(process.env.REGISTRY_REFRESH || 1800)
const healthSeconds = parseInt(process.env.HEALTH_REFRESH || 10)
const REGISTRY_REFRESH_INTERVAL = 1000 * refreshSeconds
const HEALTH_REFRESH_INTERVAL = 1000 * healthSeconds

console.log("Using config:", {
  url,
  branch,
  refreshSeconds,
  healthSeconds
})

async function queueHealthCheck(client, registry, health) {
  setTimeout(async () => {
    const chains = await registry.getChains()
    await health.refreshApis(client, chains)
    queueHealthCheck(client, registry, health)
  }, HEALTH_REFRESH_INTERVAL)
}

(async () => {
  const client = await redisClient();

  const health = HealthMonitor()
  const chainRepo = Repository(client, url, branch, { exclude: ['testnets'] })
  const registry = ChainRegistry(client)

  await chainRepo.refresh()
  setInterval(() => chainRepo.refresh(), REGISTRY_REFRESH_INTERVAL)

  const chains = await registry.getChains()
  await health.refreshApis(client, chains)
  if (REGISTRY_REFRESH_INTERVAL > 0) {
    queueHealthCheck(client, registry, health)
  }
})();
