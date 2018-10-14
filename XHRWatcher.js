const EventEmitter = require('events');


module.exports = class XHRWatcher extends EventEmitter {
  constructor() {
    super();
    this.queue = new Set();
  }

  install(window) {
    const watcher = this;

    class WrappedXMLHttpRequest extends window.XMLHttpRequest {
      constructor() {
        super();
        watcher.watch(this);
      }
    }

    window.XMLHttpRequest = WrappedXMLHttpRequest;
  }

  watch(xhr) {
    xhr.addEventListener("loadstart", () => this.handleLoadStart(xhr));
    xhr.addEventListener("loadend", () => this.handleLoadEnd(xhr));
  }

  handleLoadStart(xhr) {
    this.queue.add(xhr);
  }

  handleLoadEnd(xhr) {
    this.queue.delete(xhr);
    if (this.allDone)
      this.emit('queueEmpty');
  }

  get allDone() {
    return this.queue.size === 0;
  }

  untilDone() {
    return new Promise((resolve, reject) => {
      if (this.allDone) resolve();
      else this.on('queueEmpty', () => { resolve(); });
    });
  }
}
