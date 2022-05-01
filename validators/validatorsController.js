import Router from 'koa-router';
import _ from 'lodash';
import { renderJson } from '../utils.js';

function ValidatorsController(registry) {
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
    const repository = await registry.repository()
    const commit = await registry.commit()
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
      const validators = await registry.getRegistryValidators()
      renderJson(ctx, {
        repository: await repositoryResponse(),
        validators: _.shuffle(validators).map(validator => {
          return validatorSummary(validator);
        })
      });
    });

    router.get('/chains/:chain', async (ctx, next) => {
      let chainName = ctx.params.chain
      let validators = await registry.getChainValidators(chainName)
      renderJson(ctx, {
        name: chainName,
        validators: _.shuffle(validators)
      });
    });

    router.get('/chains/:chain/:validatorAddress', async (ctx, next) => {
      let chainName = ctx.params.chain
      let validatorAddress = ctx.params.validatorAddress
      let registryValidator = await registry.getRegistryValidatorFromAddress(validatorAddress)
      let validator = await registry.getChainValidator(chainName, validatorAddress, registryValidator)
      renderJson(ctx, {
        name: chainName,
        validator: validator
      });
    });

    router.get('/:validator', async (ctx, next) => {
      const registryValidator = await registry.getRegistryValidator(ctx.params.validator);
      if(registryValidator){
        for (const chain of registryValidator.chains) {
          await registry.getChainValidator(chain.name, chain.address, registryValidator)
        }
      }
      renderJson(ctx, registryValidator && {
        repository: await repositoryResponse(),
        validator: registryValidator.toJSON()
      });
    });

    router.get('/:validator/:dataset', async (ctx, next) => {
      const validator = await registry.getRegistryValidator(ctx.params.validator);
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