const axios = require("axios");
const _ = require("lodash");

const ChainApis = (chainId, apis) => {
  const urlTypes = ['rest', 'rpc']
  const currentUrls = {
    rpc: [],
    rest: []
  }
  let currentUrlIndex = 1;

  const bestUrl = (type) => {
    const cur = currentUrlIndex % currentUrls[type].length;
    currentUrlIndex++;
    const best = currentUrls[type][cur]
    return best && best.url
  }

  const bestUrls = (type) => {
    const best = urls[type][0]
    if(!best) return []

    return urls[type].filter(el => el.height >= best.height - 5).map(el => el.url)
  }

  const refreshUrls = () => {
    urlTypes.forEach(type => {
      if(!apis || !apis[type]) return

      const prev = currentUrls[type]
      getOrderedUrls(type).then(urls => {
        currentUrls[type] = urls
        if(prev.length > urls.length){
          console.log('Removing', chainId, type, _.difference(prev, urls))
        }else if(prev.length < urls.length){
          console.log('Adding', chainId, type, _.difference(urls, prev))
        }
      })
    })
  }

  const getOrderedUrls = (type) => {
    const urls = apis[type].map(el => el.address)
    return getBlockHeights(urls, urlPath(type), (url, data) => getBlockHeight(type, url, data))
      .then(results => {
        return results.filter(el => el.height > 0).sort((a, b) => {
          b.height - a.height
        })
      })
  }

  const urlPath = (type) => {
    return type === 'rest' ? 'blocks/latest' : 'status'
  }

  const getBlockHeight = (type, url, data) => {
    let height
    if(type === 'rpc' && data.result.node_info.network === chainId){
      height = data.result.sync_info.latest_block_height
    }else if(type === 'rest' && data.block.header.chain_id === chainId){
      height = data.block.header.height
    }
    if(!height) return {url, height: 0}
    return {url, height: height}
  }

  const getBlockHeights = (urls, path, callback) => {
    return mapAsync(urls, (url) => {
      return axios.get(url + '/' + path, {timeout: 4000})
        .then(res => res.data)
        .then(data => {
          return callback(url, data)
        }).catch(error => {
          return { url, height: 0 }
        })
    })
  }

  const mapAsync = (array, callbackfn) =>  {
    return Promise.all(array.map(callbackfn));
  }

  const filterAsync = (array, callbackfn) =>  {
    return mapAsync(array, callbackfn).then(filterMap => {
      return array.filter((value, index) => filterMap[index]);
    });
  }

  return {
    bestUrl,
    refreshUrls
  }
}

module.exports = ChainApis
