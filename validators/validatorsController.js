import Router from 'koa-router';
import _ from 'lodash';
import { renderJson } from '../utils.js';

function ValidatorsController(chainRegistry, validatorRegistry) {
  function validatorSummary(validator) {
    let chains = validator.chains.map(chain => {
      chain = _.pick(chain, ['name', 'address', 'restake'])
      return {
        ...chain,
        restake: chain.restake?.address ? chain.restake.address : false
      }
    }, {})
    return {
      ...validator.toJSON(),
      chains: chains
    };
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
      const validators = await validatorRegistry.getRegistryValidators()
      renderJson(ctx, {
        repository: await repositoryResponse(),
        validators: _.shuffle(validators).map(validator => {
          return validatorSummary(validator);
        })
      });
    });

    router.get('/chains/:chain', async (ctx, next) => {
      const chain = await chainRegistry.getChain(ctx.params.chain);
      let validators = await validatorRegistry.getChainValidators(chain, ['path', 'name', 'profile'])
      renderJson(ctx, {
        name: chain.path,
        validators: _.shuffle(validators)
      });
    });

    router.get('/chains/:chain/:validatorAddress', async (ctx, next) => {
      const chain = await chainRegistry.getChain(ctx.params.chain);
      let validatorAddress = ctx.params.validatorAddress
      let registryValidator = await validatorRegistry.getRegistryValidatorFromAddress(validatorAddress)
      let validator = await validatorRegistry.getChainValidator(chain, validatorAddress, registryValidator, ['path', 'name', 'profile'])
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
          return {
            name: validator.chain.prettyName,
            slug: validator.chain.coingeckoId,
            balanceTokenTotal: delegations.total_tokens_display,
            balanceUsdTotal: delegations.total_usd,
            usersTotal: delegations.total_count,
            feeTotal: validator.commission.rate,
            nodes: [{
              address: validator.address,
              fee: validator.commission.rate,
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