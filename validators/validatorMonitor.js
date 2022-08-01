import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import { debugLog, timeStamp, executeSync, createAgent, getAllPages } from '../utils.js';
import { Validator } from './validator.js';

const SKIP_SIGNING_INFO = ['irisnet', 'tgrade']
const TIMEOUT = 5000

function ValidatorMonitor() {
  const agent = createAgent();
  const queue = new PQueue({ concurrency: 20 });
  const gotOpts = {
    timeout: { request: TIMEOUT },
    retry: { limit: 3 },
    agent: agent
  }

  async function refreshValidators(client, chains) {
    timeStamp('Running validator update');
    await Promise.all([...chains].map(async (chain) => {
      const apis = await chain.apis('rest')

      const current = await client.json.get('validators:' + chain.path, '$') || {}

      let validators = await getAllValidators(apis, chain, current.validators || {});
      if(!validators) return timeStamp(chain.path, 'Empty validator response')
      if(!validators.reduce) validators = Object.values(validators) // Agoric returns already keyed validators
      if(!validators.length) return timeStamp(chain.path, 'No validators')

      await client.json.set('validators:' + chain.path, '$', {
        chainId: chain.chainId,
        lastUpdated: Date.now(),
        validators: validators.reduce((sum, validator) => {
          sum[validator.operator_address] = validator;
          return sum;
        }, {})
      });
      debugLog(chain.path, 'Validator update complete')
    }));
    debugLog('Validator update complete')
  }

  function getAllValidators(apis, chain, current) {
    const request = async () => {
      try {
        const url = apis.bestAddress('rest')
        if(!url) return timeStamp(chain.path, 'No API URL')
        const pages = await getAllPages((nextKey) => {
          return getValidators(url, 100, {}, nextKey);
        })
        const validators = pages.map((el) => el.validators).flat()
        await setValidatorDetails(validators, chain)
        return validators.reduce(
          (a, v) => ({ ...a, [v.operator_address]: {...current[v.operator_address], ...v} }),
          {}
        );
      } catch (error) {
        timeStamp(chain.path, 'Validator update failed', error.message)
      }
    };
    return queue.add(request, { identifier: chain.path });
  }

  const setValidatorDetails = async (validators, chain) => {
    try {
      setRank(validators)
      const calls = validators.map((validator) => {
        return async () => {
          const apis = await chain.apis('rest')
          const url = apis.bestAddress('rest')
          if(!url) return timeStamp(chain.path, validator.operator_address, 'No API URL')
          const model = new Validator(chain, validator)
          const consensusAddress = model.consensusAddress()
          try {
            validator.signing_info = !SKIP_SIGNING_INFO.includes(chain.path) ? await getSigningInfo(url, consensusAddress) || validator.signing_info : undefined
          } catch (error) { debugLog(chain.path, validator.operator_address, 'Validator signing info update failed', error.message) }
        }
      })
      await executeSync(calls, 5)
    } catch (error) {
      timeStamp(chain.path, 'Validator details update failed', error.message)
    }
  }

  const setRank = (validators) => {
    const active = validators.filter(el => el.status === 'BOND_STATUS_BONDED').slice()
    const inactive = validators.filter(el => el.status !== 'BOND_STATUS_BONDED').slice()
    let i = 0;
    [active, inactive].forEach((group) => {
      group.sort((a, b) => {
        return parseInt(b.tokens) - parseInt(a.tokens)
      }).forEach((validator) => {
        validator.rank = ++i
      })
    })
  }

  const getSigningInfo = async (url, consensusAddress) => {
    try {
      const response = await got.get(`${url}cosmos/slashing/v1beta1/signing_infos/${consensusAddress}`, gotOpts);
      const data = JSON.parse(response.body)
      return data.val_signing_info
    } catch (error) {
      if (error.response?.statusCode === 404) {
        return null
      }
      throw error
    }
  }

  const getValidators = (url, pageSize, opts, nextKey) => {
    opts = opts || {}
    const searchParams = new URLSearchParams();
    if (opts.status) searchParams.append("status", opts.status);
    if (pageSize) searchParams.append("pagination.limit", pageSize);
    if (nextKey) searchParams.append("pagination.key", nextKey);
    return got.get(url +
      "cosmos/staking/v1beta1/validators?" +
      searchParams.toString(),
      {...gotOpts, timeout: { request: 30000 }});
  };

  return {
    refreshValidators
  };
}

export default ValidatorMonitor

