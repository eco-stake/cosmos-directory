const axios = require("axios");
const _ = require("lodash")

const ERROR_COOLDOWN = 3 * 60
const ALLOWED_DELAY = 3 * 60
const ALLOWED_ERRORS = 1
const BEST_NODE_COUNT = 2
const BEST_HEIGHT_DIFF = 1
const BEST_RESPONSE_DIFF = 3

const ChainApis = (chainId, apis, previous) => {
  const urlTypes = ['rest', 'rpc']
  const current = retainUrls()
  let currentIndex = 1;

  function summary() {
    return urlTypes.reduce((sum, type) => {
      sum[type] = bestUrls(type);
      return sum;
    }, {});
  }

  function bestAddress(type) {
    const urls = bestUrls(type).slice(0, BEST_NODE_COUNT);
    const cur = currentIndex % urls.length;
    currentIndex++;
    const best = urls[cur];
    return best && best.address.replace(/\/$|$/, '/');
  }

  function bestUrls(type) {
    const urls = orderedUrls(type);
    const best = urls[0];
    if (!best)
      return [];

    return urls.filter(el => {
      return el.blockHeight >= (best.blockHeight - BEST_HEIGHT_DIFF) && 
        el.responseTime >= (best.responseTime - BEST_RESPONSE_DIFF * 1000)
    }).map(el => el.url);
  }

  function orderedUrls(type) {
    const available = Object.values(current[type]).filter(el => el.available)
    return available.sort((a, b) => {
      return b.blockHeight - a.blockHeight || a.responseTime - b.responseTime
    });
  }

  function retainUrls() {
    return urlTypes.reduce((sum, type) => {
      if(!apis || !previous) return {...sum, [type]: {}}
      const removed = Object.values(_.omit(previous[type], apis[type].map(el => el.address)))
      removed.map(url => { timeStamp('Removing', chainId, type, url.url, 'Removed from registry') })
      sum[type] = _.pick(previous[type], apis[type].map(el => el.address))
      return sum;
    }, {});
  }

  function refreshUrls() {
    urlTypes.forEach(type => {
      if (!apis || !apis[type])
        return;

      const urls = apis[type];
      urls.forEach(url => {
        const start = Date.now();
        axios.get(url.address + '/' + urlPath(type), { timeout: 12000 })
          .then(res => res.data)
          .then(data => {
            const responseTime = Date.now() - start
            current[type][url.address] = buildUrl(type, url, data, responseTime);
          }).catch(error => {
            const responseTime = Date.now() - start
            current[type][url.address] = buildUrl(type, url, undefined, responseTime, error.message);
          });
      });
    });
  }

  function urlPath(type) {
    return type === 'rest' ? 'blocks/latest' : 'block';
  }

  function buildUrl(type, url, data, responseTime, error) {
    let blockTime, blockHeight
    if(!error){
      ({ error, blockTime, blockHeight } = checkHeader(type, data))
    }

    const currentUrl = current[type][url.address] || {}
    let { lastError, lastErrorAt, available } = currentUrl
    let errorCount = currentUrl.errorCount || 0
    if(error){
      if (available) errorCount++
      lastError = error
      lastErrorAt = Date.now()
    }else if(errorCount > ALLOWED_ERRORS){
      const currentTime = Date.now()
      const cooldownDate = (currentTime - 1000 * ERROR_COOLDOWN)
      if(lastErrorAt && lastErrorAt > cooldownDate){
        error = 'Error cooldown: ' + (lastErrorAt - cooldownDate) / 1000
      }
    }

    if(!error) errorCount = 0
    const nowAvailable = errorCount <= ALLOWED_ERRORS && (!error || currentUrl.available)
    if(available && !nowAvailable){
      timeStamp('Removing', chainId, type, url.address, error);
    }else if(!available && nowAvailable){
      timeStamp('Adding', chainId, type, url.address);
    }
    
    return { 
      url, 
      lastError,
      lastErrorAt,
      errorCount,
      available: nowAvailable, 
      blockHeight: blockHeight, 
      blockTime: blockTime,
      responseTime
    };
  }

  function checkHeader(type, data){
    let error, blockTime
    if (data && type === 'rpc')
      data = data.result;

    const header = data.block.header
    if (header.chain_id !== chainId)
      error = 'Unexpected chain ID: ' + header.chain_id

    blockTime = Date.parse(header.time)
    const currentTime = Date.now()
    if(!error && blockTime < (currentTime - 1000 * ALLOWED_DELAY))
      error = 'Unexpected block delay: ' + (currentTime - blockTime) / 1000

    let blockHeight = parseInt(header.height)

    return {blockTime, blockHeight, error: error}
  }

  function timeStamp(...args) {
    console.log('[' + new Date().toISOString().substring(11, 23) + '] -', ...args);
  }

  return {
    current,
    bestAddress,
    bestUrls,
    refreshUrls,
    summary
  }
}

module.exports = ChainApis
