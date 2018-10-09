const path = require("path");
//const args = require('yargs').argv;
const express = require("express");
const fs = require("fs");
const { JSDOM } = require("jsdom");
const { Script } = require("vm");
const EventEmitter = require('events');

const PORT = process.env.PORT || 8080;
const SSR_ONLY = true;  // Only load the SSR view, without the actual app

const Bundler = require('parcel-bundler');
const app = express();
app.use('/static', express.static('dist'));

const file = 'index.js'; // Pass an absolute path to the entrypoint here
const options = {}; // See options section of api docs, for the possibilities

// Initialize a new bundler using a file and options
const bundler = new Bundler(file, options);
const readFile = require('util').promisify(fs.readFile);
const writeFile = require('util').promisify(fs.writeFile);

// Let express use the bundler middleware, this will let Parcel handle every request over your express server
app.use(bundler.middleware());

app.use(async (req, res, next) => {
  const bundle = await bundler.bundle();
  const bundleScript = await readFile(bundle.name);
  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  return renderElmApp({path: bundle.path, code: bundleScript}, fullUrl)
    .then(renderedHtml => {
      res.send(
        renderApp({
          bundlePath: SSR_ONLY ? null : `/static/${bundle.entryAsset.id}`,
          renderedHtml,
         })
       );
    })
    .catch(next);
});


const renderElmApp = (bundle, url) =>
  new Promise((resolve, reject) => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="app">`, {
      url,
      runScripts: "outside-only"
    });
    const rafHandler = new QueueRAFHandler();
    rafHandler.install(dom.window);
    const xhrWatcher = new XHRWatcher();
    xhrWatcher.install(dom.window);

    const tryResolve = () => {
      dom.window.requestAnimationFrame(function resolveIfReady() {
        if (xhrWatcher.allDone) {
          if (rafHandler.queue.length === 0) {
            console.log('No pending XHR, and nothing in RAF queue: pushing the results');
            resolve(dom.window.document.body.innerHTML);
            dom.window.close();
          } else {
            tryResolve();
          }
        } else {
          console.log("RAF with an XHR in progress, let's try later");
          xhrWatcher.once('queueEmpty', tryResolve);
        }
      });
      rafHandler.runQueue();
    };
    try {
      dom.runVMScript(new Script(bundle.code, {filename: bundle.path}));
      tryResolve();
    } catch (err) {
      reject(err);
    }
  });

const renderApp = ({bundlePath, renderedHtml}) => {
  return `<!DOCTYPE html>
<html><body>
${renderedHtml}
${bundlePath ? `<script src="${bundlePath}"></script>` : ""}
</body></html>`;
}

class QueueRAFHandler {
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

class XHRWatcher extends EventEmitter {
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
}

app.listen(PORT);
