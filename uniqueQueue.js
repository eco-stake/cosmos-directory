export class UniqueQueue {
  constructor() {
    this._queue = [];
  }

  enqueue(run, options) {
    if(!this.filter(options).length){
      const runData = {
        identifier: options.identifier,
        run: run
      };
      return this._queue.push(runData);
    }else{
      return this._queue
    }
  }

  dequeue() {
    const job = this._queue.shift();
    return job.run;
  }

  get size() {
    return this._queue.length;
  }

  filter(options) {
    return this._queue.filter(el => el.identifier === options.identifier);
  }
}
