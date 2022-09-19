module.exports = [{
  "name": "app",
  "script": "app.js",
  "instances": process.env.INSTANCES || 1,
  "cron_restart": "0 */3 * * *",
  "max_memory_restart": "300M",
  "watch": process.env.NODE_ENV === 'development'
}, {
  "name": "chain-worker",
  "script": "chainWorker.js",
  "cron_restart": "0 */3 * * *",
  "watch": process.env.NODE_ENV === 'development'
}, {
  "name": "validator-worker",
  "script": "validatorWorker.js",
  "cron_restart": "0 */3 * * *",
  "watch": process.env.NODE_ENV === 'development'
}, {
  "name": "block-worker",
  "script": "blockWorker.js",
  "cron_restart": "0 */3 * * *",
  "watch": process.env.NODE_ENV === 'development'
}]