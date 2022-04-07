import Router from 'koa-router';
import _ from 'lodash';
import { renderJson } from '../utils.js';

function ValidatorsController(registry) {
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
      const validators = await registry.getValidators()
      renderJson(ctx, {
        repository: await repositoryResponse(),
        validators: validators.map(validator => {
          return summary(validator);
        })
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
      const validator = await registry.getValidator(ctx.params.validator);
      renderJson(ctx, validator && {
        repository: await repositoryResponse(),
        validator: summary(validator)
      });
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

export default ValidatorsController