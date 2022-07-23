import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import { debugLog, timeStamp, executeSync, createAgent } from '../utils.js';
import { Validator } from './validator.js';

const TIMEOUT = 20000

function ValidatorMonitor() {
  const agent = createAgent();
  const queue = new PQueue({ concurrency: 5 });
  const gotOpts = {
    timeout: { request: TIMEOUT },
    retry: { limit: 3 },
    agent: agent
  }

  async function refreshValidators(client, chains) {
    timeStamp('Running validator update');
    await Promise.all([...chains].map(async (chain) => {
      const apis = await chain.apis('rest')
      const url = apis.bestAddress('rest')
      const height = apis.bestHeight('rest')
      if(!url) return timeStamp(chain.path, 'No API URL')

      const current = await client.json.get('validators:' + chain.path, '$') || {}

      let validators = await getAllValidators(url, height, chain, current.validators || {});
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

  function getAllValidators(url, height, chain, current) {
    const request = async () => {
      try {
        const pages = await getAllPages((nextKey) => {
          return getValidators(url, 100, {}, nextKey);
        })
        const validators = pages.map((el) => el.validators).flat()
        await setValidatorDetails(validators, chain, url, height)
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

  const setValidatorDetails = async (validators, chain, url, height) => {
    try {
      setRank(validators)
      const calls = validators.map((validator) => {
        return async () => {
          const model = new Validator(chain, validator)
          const consensusAddress = model.consensusAddress()
          try {
            validator.slashes = await getSlashes(url, height, model.address)
          } catch (error) { debugLog(chain.path, validator.operator_address, 'Validator slashes update failed', error.message) }
          try {
            validator.signing_info = await getSlashInfo(url, consensusAddress)
          } catch (error) { debugLog(chain.path, validator.operator_address, 'Validator signing info update failed', error.message) }
        }
      })
      await executeSync(calls, 10)
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

  const getSlashes = async (url, height, operatorAddress) => {
    const pages = await getAllPages((nextKey) => {
      const searchParams = new URLSearchParams();
      searchParams.append("pagination.limit", 100);
      searchParams.append("ending_height", height);
      if (nextKey) searchParams.append("pagination.key", nextKey);
      return got.get(`${url}cosmos/distribution/v1beta1/validators/${operatorAddress}/slashes?` + searchParams.toString(), gotOpts).catch(error => {
        if(error.response?.statusCode === 404){
          return []
        }
        throw error
      });
    })
    return pages.map((el) => el.slashes).flat()
  }

  const getSlashInfo = async (url, consensusAddress) => {
    try {
      const response = await got.get(`${url}cosmos/slashing/v1beta1/signing_infos/${consensusAddress}`, gotOpts);
      const data = JSON.parse(response.body)
      return data.val_signing_info
    } catch (error) {
      if (error.response?.statusCode === 404) {
        return {}
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
      gotOpts);
  };

  const getAllPages = async (getPage) => {
    let pages = [];
    let nextKey
    do {
      const result = await getPage(nextKey);
      if(result && result.body){
        const json = JSON.parse(result.body)
        pages.push(json);
        nextKey = json.pagination?.next_key;
      }else{
        nextKey = undefined
      }
    } while (nextKey);
    return pages;
  };

  return {
    refreshValidators
  };
}

export default ValidatorMonitor

