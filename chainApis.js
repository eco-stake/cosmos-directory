const axios = require("axios");
const _ = require("lodash")

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

    return urls.filter(el => el.height >= (best.height - 3)).map(el => el.url);
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
      removed.map(url => { timeStamp('Removing', chainId, type, url, 'Removed from registry') })
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
        axios.get(url + '/' + urlPath(type), { timeout: 10000 })
          .then(res => res.data)
          .then(data => {
            if (!current[type][url])
              timeStamp('Adding', chainId, type, url);
            current[type][url] = blockHeight(type, url, data);
          }).catch(error => {
            if (current[type][url])
              timeStamp('Removing', chainId, type, url, error.message);
            delete current[type][url];
          });
      });
    });
  }

  function urlPath(type) {
    return type === 'rest' ? 'blocks/latest' : 'block';
  }

  function blockHeight(type, url, data) {
    let height;
    if (type === 'rpc')
      data = data.result;
    if (data.block.header.chain_id !== chainId)
      return { url, height: 0 };

    height = data.block.header.height;
    return { url, height: parseInt(height) };
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
