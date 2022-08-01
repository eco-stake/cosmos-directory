import _ from "lodash";
import Agent from 'agentkeepalive'
import { format } from 'mathjs'

export function formatNumber(number) {
  return number && format(number, { notation: 'fixed' })
}

export function debugLog(...args) {
  if(process.env.DEBUG === '1'){
    timeStamp(...args)
  }
}

export function timeStamp(...args) {
  console.log('[' + new Date().toISOString().substring(11, 23) + '] -', ...args);
}

export function renderJson(ctx, object){
  if(object){
    ctx.body = object
  }else{
    ctx.status = 404
    ctx.body = 'Not found'
  }
}

export function mapAsync(array, callbackfn) {
  return Promise.all(array.map(callbackfn));
}

export async function executeSync(calls, count){
  const batchCalls = _.chunk(calls, count);
  for (const batchCall of batchCalls) {
    await mapAsync(batchCall, call => call())
  }
}

export async function getAllPages(getPage){
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

export function createAgent(opts) {
  const agentOpts = {
    maxSockets: 100,
    maxFreeSockets: 10,
    timeout: 60000,
    freeSocketTimeout: 30000,
    ...opts
  };
  return {
    http: new Agent(agentOpts),
    https: new Agent.HttpsAgent(agentOpts)
  };
}