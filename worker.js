import ChainRegistry from './chainRegistry/chainRegistry.js';
import Repository from './repository/repository.js';
import HealthMonitor from './status/healthMonitor.js';
import { redisClient } from "./redisClient.js";

const chainUrl = process.env.CHAIN_URL
const chainBranch = process.env.CHAIN_BRANCH
const chainRefreshSeconds = parseInt(process.env.CHAIN_REFRESH || 1800)
const validatorUrl = process.env.VALIDATOR_URL
const validatorBranch = process.env.VALIDATOR_BRANCH
const validatorRefreshSeconds = parseInt(process.env.VALIDATOR_REFRESH || 900)
const healthSeconds = parseInt(process.env.HEALTH_REFRESH || 10)
const CHAIN_REFRESH_INTERVAL = 1000 * chainRefreshSeconds
const VALIDATOR_REFRESH_INTERVAL = 1000 * validatorRefreshSeconds
const HEALTH_REFRESH_INTERVAL = 1000 * healthSeconds

console.log("Using config:", {
  chainUrl,
  chainBranch,
  chainRefreshSeconds,
  validatorUrl,
  validatorBranch,
  validatorRefreshSeconds,
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
  const chainRepo = Repository(client, chainUrl, chainBranch, { exclude: ['testnets'] })
  const validatorRepo = Repository(client, validatorUrl, validatorBranch, { exclude: [] })
  await chainRepo.refresh()
  setInterval(() => chainRepo.refresh(), CHAIN_REFRESH_INTERVAL)

  await validatorRepo.refresh()
  setInterval(() => validatorRepo.refresh(), VALIDATOR_REFRESH_INTERVAL)

  const registry = ChainRegistry(client)
  const chains = await registry.getChains()
  await health.refreshApis(client, chains)
  if (CHAIN_REFRESH_INTERVAL > 0) {
    queueHealthCheck(client, registry, health)
  }
})();