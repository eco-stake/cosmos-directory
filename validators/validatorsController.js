import Router from 'koa-router';
import _ from 'lodash';
import { renderJson } from '../utils.js';

function ValidatorsController(chainRegistry, validatorRegistry) {
  function validatorSummary(validator) {
    const json = validator.toJSON()
    return {
      ...json,
      chains: json.chains.map(chain => {
        const attrs = ['name', 'moniker', 'identity', 'address', 'active', 'jailed',
        'status', 'delegations', 'description', 'commission.rate', 'rank',
        'slashes', 'image', 'restake', 'missed_blocks_periods']
        return _.pick(chain, attrs)
      })
    }
  }

  async function repositoryResponse() {
    const repository = await validatorRegistry.repository()
    const commit = await validatorRegistry.commit()
    return {
      url: repository.url,
      branch: repository.branch,
      commit: commit.oid,
      timestamp: commit.commit.author.timestamp
    }
  }

  function routes() {
    const router = new Router();

    router.get('/', async (ctx, next) => {
      const validators = await validatorRegistry.getRegistryValidatorsWithChains(chainRegistry)
      renderJson(ctx, {
        repository: await repositoryResponse(),
        validators: _.shuffle(validators).map(validator => {
          return validatorSummary(validator);
        })
      });
    });

    router.get('/registry', async (ctx, next) => {
      const validators = await validatorRegistry.getRegistryValidators()
      renderJson(ctx, {
        repository: await repositoryResponse(),
        validators: _.shuffle(validators).map(validator => {
          return validator.toJSON();
        })
      });
    });

    router.get('/chains/:chain', async (ctx, next) => {
      const chain = await chainRegistry.getChain(ctx.params.chain);
      let validators = chain && await validatorRegistry.getChainValidatorsWithRegistry(chain)
      renderJson(ctx, chain && {
        name: chain.path,
        validators: _.shuffle(validators)
      });
    });

    router.get('/chains/:chain/:validatorAddress', async (ctx, next) => {
      const chain = await chainRegistry.getChain(ctx.params.chain);
      let validator
      if(chain){
        let validatorAddress = ctx.params.validatorAddress
        let registryValidator = await validatorRegistry.getRegistryValidatorFromAddress(validatorAddress)
        validator = await validatorRegistry.getChainValidator(chain, validatorAddress, registryValidator)
      }
      renderJson(ctx, validator && {
        name: chain.path,
        validator: validator
      });
    });

    router.get('/:validator', async (ctx, next) => {
      const registryValidator = await validatorRegistry.getRegistryValidator(ctx.params.validator);
      if(registryValidator){
        for (const chainData of registryValidator.chains) {
          let chain = await chainRegistry.getChain(chainData.name)
          if(chain){
            await validatorRegistry.getChainValidator(chain, chainData.address, registryValidator)
          }
        }
      }
      renderJson(ctx, registryValidator && {
        repository: await repositoryResponse(),
        validator: registryValidator.toJSON()
      });
    });

    router.get('/:validator/staking-rewards', async (ctx, next) => {
      const registryValidator = await validatorRegistry.getRegistryValidator(ctx.params.validator);
      if(registryValidator){
        for (const chainData of registryValidator.chains) {
          let chain = await chainRegistry.getChain(chainData.name)
          if(chain){
            await validatorRegistry.getChainValidator(chain, chainData.address, registryValidator)
          }
        }
      }
      renderJson(ctx, registryValidator && {
        name: registryValidator.name,
        balanceUsd: registryValidator.totalUSD(),
        users: registryValidator.totalUsers(),
        supportedAssets: Object.values(registryValidator.validators).map(validator => {
          const delegations = validator.delegations()
          const slug = validator.chain.services?.staking_rewards?.slug || validator.chain.coingeckoId
          return {
            name: validator.chain.prettyName,
            slug: slug,
            balanceTokenTotal: delegations.total_tokens_display,
            balanceUsdTotal: delegations.total_usd,
            usersTotal: delegations.total_count,
            feeTotal: validator.commission.rate,
            nodes: [{
              address: validator.address,
              fee: validator.commission.rate,
              slashes: validator.data.slashes,
              users: delegations.total_count,
              balanceUsd: delegations.total_usd,
              balanceToken: delegations.total_tokens_display,
            }]
          }
        })
      });
    });

    router.get('/:validator/:dataset', async (ctx, next) => {
      const validator = await validatorRegistry.getRegistryValidator(ctx.params.validator);
      let dataset = ctx.params.dataset.replace(/\.[^.]*$/,'')
      renderJson(ctx, validator && validator.getDataset(dataset));
    });

    return router.routes();
  }

  return {
    routes
  };
}

export default ValidatorsController
