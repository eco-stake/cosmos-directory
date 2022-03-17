const axios = require("axios");
const _ = require("lodash")

const ERROR_COOLDOWN=120
const ALLOWED_DELAY=60

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

  function bestUrl(type) {
    const urls = bestUrls(type);
    const cur = currentIndex % urls.length;
    currentIndex++;
    const best = urls[cur];
    return best;
  }

  function bestUrls(type) {
    const urls = orderedUrls(type);
    const best = urls[0];
    if (!best)
      return [];

    return urls
      .filter(el => el.available)
      .filter(el => el.height >= (best.height - 1))
      .map(el => el.url);
  }

  function orderedUrls(type) {
    return Object.values(current[type]).filter(el => el.height > 0).sort((a, b) => {
      return b.height - a.height;
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

      const urls = apis[type].map(el => el.address);
      urls.forEach(url => {
        axios.get(url + '/' + urlPath(type), { timeout: 12000 })
          .then(res => res.data)
          .then(data => {
            current[type][url] = buildUrl(type, url, data);
          }).catch(error => {
            current[type][url] = errorUrl(type, url, error.message);
          });
      });
    });
  }

  function urlPath(type) {
    return type === 'rest' ? 'blocks/latest' : 'block';
  }

  function buildUrl(type, url, data) {
    if (type === 'rpc')
      data = data.result;
    const header = data.block.header
    if (header.chain_id !== chainId)
      return errorUrl(type, url, 'Unexpected chain ID: ' + header.chain_id);

    const nodeTime = Date.parse(header.time)
    const currentTime = Date.now()
    if(nodeTime < (currentTime - 1000 * ALLOWED_DELAY))
      return errorUrl(type, url, 'Unexpected block delay: ' + (currentTime - nodeTime) / 1000);

    const { lastError, lastErrorAt, available } = current[type][url] || {}
    const cooldownDate = (currentTime - 1000 * ERROR_COOLDOWN)
    if(lastErrorAt && lastErrorAt > cooldownDate)
      return errorUrl(type, url, 'Error cooldown: ' + (lastErrorAt - cooldownDate) / 1000, lastErrorAt);

    if (!available)
      timeStamp('Adding', chainId, type, url);

    return { 
      url, 
      lastError,
      lastErrorAt,
      available: true, 
      height: parseInt(header.height), 
      time: nodeTime
    };
  }

  function errorUrl(type, url, error, lastErrorAt){
    const { available, height, time } = current[type][url] || {}
    if (available) {
      timeStamp('Removing', chainId, type, url, error);
    }
    return { 
      url, 
      lastError: error, 
      lastErrorAt: lastErrorAt || Date.now(),
      available: false,
      height,
      time
    };
  }

  function timeStamp(...args) {
    console.log('[' + new Date().toISOString().substring(11, 23) + '] -', ...args);
  }

  return {
    current,
    bestUrl,
    bestUrls,
    refreshUrls,
    summary
  }
}

module.exports = ChainApis
