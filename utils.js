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
