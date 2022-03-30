import Router from 'koa-router';
import _ from 'lodash';
import { renderJson } from '../utils.js';

function ValidatorRegistryController(registry) {
  function summary(validator) {
    const { name } = validator
    const { identity } = validator.profile
    const chains = validator.chains.chains.map(el => _.pick(el, ['name', 'address', 'restake']))
    chains.forEach(el => el.restake = el.restake?.address ? el.restake.address : false)
    return {
      path: validator.path,
      name,
      identity,
      chains: chains
    };
  }

  function chain(chainName, validator){
    const { profile } = validator
    const chain = validator.chains.chains.find(el => el.name === chainName)
    return {
      path: validator.path,
      ...profile,
      ..._.omit(chain, 'name')
    }
  }

  function routes() {
    const router = new Router();

    router.get('/', async (ctx, next) => {
      const validators = await registry.getValidators()
      renderJson(ctx, {
        validators: validators.map(validator => {
          return summary(validator);
        })
      });
    });

    router.get('/chains/:chain', async (ctx, next) => {
      let validators = await registry.getValidators()
      let chainName = ctx.params.chain
      validators = validators.filter(el => !!el.chains.chains.find(chain => chain.name === chainName))
      renderJson(ctx, {
        name: chainName,
        validators: validators.map(validator => {
          return chain(chainName, validator)
        })
      });
    });

    router.get('/:validator', async (ctx, next) => {
      const validator = await registry.getValidator(ctx.params.validator);
      renderJson(ctx, validator && summary(validator));
    });

    router.get('/:validator/:dataset', async (ctx, next) => {
      const validator = await registry.getValidator(ctx.params.validator);
      let dataset = ctx.params.dataset.replace(/\.[^.]*$/,'')
      dataset = ['path'].includes(dataset) ? undefined : dataset
      renderJson(ctx, validator && dataset && validator.data[dataset]);
    });

    return router.routes();
  }

  return {
    routes
  };
}

export default ValidatorRegistryController