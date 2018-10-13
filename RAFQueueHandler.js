module.exports = class RAFQueueHandler {
  constructor() {
    this.queue = [];
  }

  runQueue() {
    console.log('Handling RAF callbacks', this.queue);
    while (this.queue.length > 0)
      this.queue.shift()();
  }

  push(callback) {
    this.queue.push(callback);
  }

  install(target) {
    target.requestAnimationFrame = (callback) => {
      console.log("New RAF callback", [callback]);
      this.push(callback);
    }
  }
}
