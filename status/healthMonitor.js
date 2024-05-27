import PQueue from 'p-queue';
import got from 'got';
import _ from 'lodash'
import { timeStamp, debugLog, createAgent } from '../utils.js';

const ALLOWED_DELAY = 30 * 60
const ALLOWED_ERRORS = 10
const ERROR_COOLDOWN = 10 * 60
const RATE_LIMIT_COOLDOWN = 3 * 24 * 60 * 60
const HEALTH_TIMEOUT = 5000
const HEALTH_CONCURRENCY = parseInt(process.env.HEALTH_CONCURRENCY || 20)

function HealthMonitor() {
  const agent = createAgent();
  const queue = new PQueue({ concurrency: HEALTH_CONCURRENCY });

  async function refreshApis(client, chains) {
    timeStamp('Running health checks');
    await Promise.all([...chains].map(async (chain) => {
      await Promise.all(['rpc', 'rest', 'private-rpc', 'private-rest', 'service'].map(async (type) => {
        const urls = chain.apiUrls(type)
        const apis = await chain.apis()
        const health = apis.health[type] || {};
        const updated = await Promise.all([...urls].map(async (url) => {
          const urlHealth = health[url.address] || {};
          return await checkUrl(url, type, chain, { ...urlHealth });
        }));
        if(!await client.exists('health:' + chain.path)) await client.json.set('health:' + chain.path, '$', {})
        await client.json.set('health:' + chain.path, '$.' + type, updated.reduce((sum, url) => {
          if (url)
            sum[url.url.address] = url;
          return sum;
        }, {}));
      }));
    }));
    debugLog('Health checks complete')
  }

  function checkUrl(url, type, chain, urlHealth) {
    const request = async () => {
      try {
        let address = new URL(url.address).href.replace(/\/$|$/, '/')
        const { path, response } = await getLatestBlock(address, type, urlPath(type))
        return buildUrl({ type, chain, url, urlHealth, path, response });
      } catch (error) {
        return buildUrl({ type, chain, url, urlHealth, error });
      }
    };
    return queue.add(request, { identifier: url.address });
  }

  async function getLatestBlock(url, type, path){
    try {
      return {
        path,
        response: await got.get(url + path, {
          timeout: { request: HEALTH_TIMEOUT },
          retry: { limit: 1 },
          agent: agent
        })
      }
    } catch (error) {
      const fallback = fallbackPath(type)
      if (fallback && fallback !== path && error.response?.statusCode === 501) {
        return getLatestBlock(url, type, fallback)
      }
      throw(error)
    }
  }

  function urlPath(type) {
    switch (type) {
      case "rest":
      case "private-rest":
      case "service":
        return 'cosmos/base/tendermint/v1beta1/blocks/latest'
      case "rpc":
      case "private-rpc":
        return "block"
    }
  }

  function fallbackPath(type){
    switch (type) {
      case "rest":
      case "private-rest":
      case "service":
        return 'blocks/latest'
    }
  }

  function buildUrl({ type, chain, url, urlHealth, path, response, error }) {
    let timings, body, data
    let blockTime = urlHealth?.blockTime
    let blockHeight = urlHealth?.blockHeight || 0;
    let finalAddress = urlHealth?.finalAddress
    if (!error) {
      ({ timings, body } = response)
      data = JSON.parse(body);
      const regex = new RegExp(`${path}/?$`)
      finalAddress = new URL(response.url).href.replace(regex, '').replace(/\/$|$/, '/');
      ({ error, blockTime, blockHeight } = checkHeader(type, data, chain.chainId));
    }else{
      ({ timings, response } = error)
    }
    const responseTime = timings?.phases?.total

    let { lastError, lastErrorAt, lastSuccessAt, available, rateLimited, rateLimitedAt } = urlHealth;
    let errorCount = urlHealth.errorCount || 0;
    if (error) {
      errorCount++;
      lastError = error.message;
      lastErrorAt = Date.now();
      if(response?.statusCode === 429){
        rateLimitedAt = Date.now()
      }
    } else {
      lastSuccessAt = Date.now();
      if (errorCount > 0) {
        const currentTime = Date.now();
        const cooldownDate = currentTime - 1000 * ERROR_COOLDOWN;
        if (lastErrorAt <= cooldownDate) {
          errorCount = 0;
        }
      }
      // Force rate limiting of certain problematic domains
      const RATE_LIMITED_DOMAINS = ['publicnode.com', 'pupmos.network']
      const hostname = new URL(finalAddress).hostname
      if(RATE_LIMITED_DOMAINS.some(domain => hostname.includes(domain))){
        rateLimitedAt = Date.now()
      }
    }
    rateLimited = rateLimitedAt && rateLimitedAt > Date.now() - 1000 * RATE_LIMIT_COOLDOWN

    let nowAvailable = false;
    if (errorCount <= ALLOWED_ERRORS) {
      nowAvailable = !error || !!urlHealth.available;
    }
    if (available && !nowAvailable) {
      timeStamp('Removing', chain.path, type, url.address, error?.message);
    } else if (!available && nowAvailable) {
      timeStamp('Adding', chain.path, type, url.address);
    } else if (available && error) {
      timeStamp('Failed', chain.path, type, url.address, error.message);
    }

    return {
      url,
      finalAddress,
      lastError,
      lastErrorAt,
      lastSuccessAt,
      errorCount,
      rateLimited,
      rateLimitedAt,
      available: nowAvailable,
      blockHeight: blockHeight,
      blockTime: blockTime,
      responseTime,
      lastCheck: Date.now()
    };
  }

  function checkHeader(type, data, chainId) {
    let error, blockTime;
    if (data && ['rpc', 'private-rpc'].includes(type))
      data = data.result;

    const header = data.block.header;
    if (header.chain_id !== chainId)
      error = 'Unexpected chain ID: ' + header.chain_id;

    blockTime = Date.parse(header.time);
    const currentTime = Date.now();
    if (!error && blockTime < (currentTime - 1000 * ALLOWED_DELAY))
      error = 'Unexpected block delay: ' + (currentTime - blockTime) / 1000;

    let blockHeight = parseInt(header.height);

    if(error) error = new Error(error)
    return { blockTime, blockHeight, error };
  }

  return {
    refreshApis
  };
}

export default HealthMonitor
