import Bugsnag from "@bugsnag/js"
import ChainRegistry from './chains/chainRegistry.js';
import ValidatorMonitor from './validators/validatorMonitor.js';
import { redisClient } from "./redisClient.js";
import ValidatorImageMonitor from "./validators/validatorImageMonitor.js";
import ServicesMonitor from "./services/servicesMonitor.js";

const validatorRefreshSeconds = parseInt(process.env.VALIDATOR_REFRESH || 60 * 5)
const validatorImageRefreshSeconds = parseInt(process.env.VALIDATOR_IMAGE_REFRESH || 60 * 60 * 12)
const servicesRefreshSeconds = parseInt(process.env.STAKING_REWARDS_REFRESH || 60 * 60)
const stakingRewardsKey = process.env.STAKING_REWARDS_KEY

console.log("Using config:", {
  validatorRefreshSeconds,
  validatorImageRefreshSeconds,
  servicesRefreshSeconds
})

if(process.env.BUGSNAG_KEY){
  Bugsnag.start({
    apiKey: process.env.BUGSNAG_KEY,
    enabledReleaseStages: ['production', 'staging'],
    releaseStage: process.env.NODE_ENV
  })
}

async function queueValidatorCheck(client, registry, monitor) {
  setTimeout(async () => {
    const chains = await registry.getChains()
    await monitor.refreshValidators(client, chains)
    queueValidatorCheck(client, registry, monitor)
  }, 1000 * validatorRefreshSeconds)
}

async function queueValidatorImageCheck(client, registry, monitor) {
  setTimeout(async () => {
    const chains = await registry.getChains()
    await monitor.refreshValidatorImages(client, chains)
    queueValidatorImageCheck(client, registry, monitor)
  }, 1000 * validatorImageRefreshSeconds)
}

async function queueServicesCheck(client, registry, monitor) {
  setTimeout(async () => {
    const chains = await registry.getChains()
    await monitor.refreshServices(client, chains, stakingRewardsKey)
    queueServicesCheck(client, registry, monitor)
  }, 1000 * servicesRefreshSeconds)
}

(async () => {
  const client = await redisClient();

  const chainRegistry = ChainRegistry(client)
  const chains = await chainRegistry.getChains()

  const validatorMonitor = ValidatorMonitor()
  await validatorMonitor.refreshValidators(client, chains)
  if (validatorRefreshSeconds > 0) {
    queueValidatorCheck(client, chainRegistry, validatorMonitor)
  }

  const validatorImageMonitor = ValidatorImageMonitor()
  validatorImageMonitor.refreshValidatorImages(client, chains)
  if (validatorImageRefreshSeconds > 0) {
    queueValidatorImageCheck(client, chainRegistry, validatorImageMonitor)
  }

  const servicesMonitor = ServicesMonitor()
  servicesMonitor.refreshServices(client, chains, stakingRewardsKey)
  if (servicesRefreshSeconds > 0) {
    queueServicesCheck(client, chainRegistry, servicesMonitor)
  }
})();
