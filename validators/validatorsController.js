import Router from 'koa-router';
import _ from 'lodash';
import { renderJson } from '../utils.js';

function ValidatorsController(registry) {
  async function validatorResponse(validator, summarize) {
    let chains = validator.chains.chains
    if(summarize){
      chains = chains.map(el => _.pick(el, ['name', 'address', 'restake']))
      chains = chains.map(chain => {
        return {
          ...chain,
          restake: chain.restake?.address ? chain.restake.address : false
        }
      }, {})
    }else{
      chains = await Promise.all(chains.map(async chain => {
        const chainValidator = await registry.getChainValidator(chain.name, chain.address)
        return {
          ...chain,
          ...chainValidator
        }
      }))
    }
    return {
      ...validator,
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
        validators: await Promise.all(validators.map(async validator => {
          return await validatorResponse(validator, true);
        }))
      });
    });

    router.get('/chains/:chain', async (ctx, next) => {
      let chainName = ctx.params.chain
      let validators = await registry.getAllValidators(chainName)
      renderJson(ctx, {
        name: chainName,
        validators: _.shuffle(validators)
      });
    });

    router.get('/:validator', async (ctx, next) => {
      const validator = await registry.getRegistryValidator(ctx.params.validator);
      renderJson(ctx, validator && {
        repository: await repositoryResponse(),
        validator: await validatorResponse(validator)
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