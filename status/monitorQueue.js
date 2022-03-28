export class MonitorQueue {
  constructor() {
    this._queue = [];
  }

  enqueue(run, options) {
    const runData = {
      address: options.address,
      run: run
    };
    return this._queue.push(runData);
  }

  dequeue() {
    const job = this._queue.shift();
    return job.run;
  }

  get size() {
    return this._queue.length;
  }

  filter(options) {
    return this._queue.filter(el => el.address === options.address);
  }
}
