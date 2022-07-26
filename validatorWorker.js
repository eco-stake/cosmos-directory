import Bugsnag from "@bugsnag/js"
import ChainRegistry from './chains/chainRegistry.js';
import ValidatorMonitor from './validators/validatorMonitor.js';
import { redisClient } from "./redisClient.js";
import ValidatorImageMonitor from "./validators/validatorImageMonitor.js";
import StakingRewardsMonitor from "./services/stakingRewardsMonitor.js";

const validatorRefreshSeconds = parseInt(process.env.VALIDATOR_REFRESH || 60 * 5)
const validatorImageRefreshSeconds = parseInt(process.env.VALIDATOR_IMAGE_REFRESH || 60 * 60 * 12)
const stakingRewardsKey = process.env.STAKING_REWARDS_KEY
const stakingRewardsRefreshSeconds = parseInt(process.env.STAKING_REWARDS_REFRESH || 60 * 60)

console.log("Using config:", {
  validatorRefreshSeconds,
  validatorImageRefreshSeconds,
  stakingRewardsRefreshSeconds
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

async function queueStakingRewardsCheck(client, registry, monitor) {
  setTimeout(async () => {
    const chains = await registry.getChains()
    await monitor.refreshStakingRewards(client, chains, stakingRewardsKey)
    queueStakingRewardsCheck(client, registry, monitor)
  }, 1000 * stakingRewardsRefreshSeconds)
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

  if(stakingRewardsKey){
    const stakingRewardsMonitor = StakingRewardsMonitor()
    stakingRewardsMonitor.refreshStakingRewards(client, chains, stakingRewardsKey)
    if (stakingRewardsRefreshSeconds > 0) {
      queueStakingRewardsCheck(client, chainRegistry, stakingRewardsMonitor)
    }
  }
})();