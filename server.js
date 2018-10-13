const path = require("path");
//const args = require('yargs').argv;
const express = require("express");
const fs = require("fs");
const { JSDOM } = require("jsdom");
const { Script } = require("vm");
const EventEmitter = require('events');


const PORT = process.env.PORT || 8080;
const SSR_ONLY = process.env.SSR_ONLY == '1';  // Only load the SSR view, without the actual app
const DEBUGGER = process.env.ELM_DEBUG == '1';  // Compile with the debugger
const SSR = !DEBUGGER && process.env.SSR != '0';  // Pre-render the app on the server
console.log("Starting with options", {SSR, DEBUGGER, SSR_ONLY, PORT});

// Hack to force-add the debugger {
const elmCompiler = require('node-elm-compiler');
const wrapF = (obj, name, wrapper) => {
  const original = obj[name];
  obj[name] = wrapper(original);
}
wrapF(elmCompiler, 'compileToString', (compileToString) => (sources, options) => {
  options.debug = DEBUGGER;
  return compileToString(sources, options);
});
// }

const CmdNone = { '$': 2, m: { '$': '[]' } };

const Bundler = require('parcel-bundler');
const app = express();
app.use('/static', express.static('dist'));

const file = 'index.js'; // Pass an absolute path to the entrypoint here
const options = {
  hmr: false,  // TODO: fix HMR with elm-hot
}; // See options section of api docs, for the possibilities

// Initialize a new bundler using a file and options
const bundler = new Bundler(file, options);
const readFile = require('util').promisify(fs.readFile);
const writeFile = require('util').promisify(fs.writeFile);

// Inject the stepperBuilder wrapper into the code bundle
bundler.on('buildEnd', () => {
  if (!bundler.mainBundle) return;
  const path = bundler.mainBundle.name;
  const raw = fs.readFileSync(path, {encoding: 'utf-8'});
  const mangled = raw
    .replace(
      /(function _Platform_initialize\([^)]+\))\n{/,
      `$1 {
        if (window.stepperBuilderWrapper)
          stepperBuilder = window.stepperBuilderWrapper(stepperBuilder);
        if (window.buildSSRModel) {
          try {
            const model = window.buildSSRModel("${bundler.mainBundle.getHash()}", fns);
            init = () => ({ "$": '#2', a: model, b: ${JSON.stringify(CmdNone)}});
            window._hydration_error = null;
          } catch (e) {
            window._hydration_error = e;
          }
        }
      `)
    .replace(
      /\nfunction F\(arity, fun, wrapper\) {/,
      "\nvar fns = {}; function F(arity, fun, wrapper) {")
    .replace(
      // TODO: This should handle all unicode letters, not just [0-9],
      // but node doesn't have a class for all letters.
      /\nvar ([\w\d]+\$[\w\d$]+) = function /gu,
      "\nvar $1 =fns.$1 = function $1 ");
  fs.writeFileSync(path, mangled);
});

// Let express use the bundler middleware, this will let Parcel handle every request over your express server
app.use(bundler.middleware());

app.use(async (req, res, next) => {
  const bundle = await bundler.bundle();
  const bundleScript = await readFile(bundle.name);
  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  return renderElmApp({path: bundle.path, hash: bundle.getHash(), code: bundleScript}, fullUrl)
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
    if (!SSR) {
      resolve('<div id="app"></div>');
      return;
    }

    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="app">`, {
      url,
      runScripts: "outside-only"
    });
    const rafHandler = new QueueRAFHandler();
    rafHandler.install(dom.window);
    const xhrWatcher = new XHRWatcher();
    xhrWatcher.install(dom.window);

    let lastModel = null;
    dom.window._on_model_step = (model) => {
      console.log('Model step', model);
      lastModel = model;
    }
    dom.window.stepperBuilderWrapper = (stepperBuilder) => {
      return (sendToApp, initialModel) => {
        const baseStepper = stepperBuilder(sendToApp, initialModel);
        return (nextModel, isSync) => {
          dom.window._on_model_step(nextModel);
          return baseStepper(nextModel, isSync);
        }
      }
    };

    const tryResolve = () => {
      dom.window.requestAnimationFrame(function resolveIfReady() {
        if (xhrWatcher.allDone) {
          if (rafHandler.queue.length === 0) {
            console.log('No pending XHR, and nothing in RAF queue: pushing the results');
            console.log('Pushing model state', lastModel);
            resolve(
              `${dom.window.document.body.innerHTML}
              <script>window.buildSSRModel = (bundleHash, fns) => {
                if (bundleHash !== "${bundle.hash}") {
                  throw new Error("Bundle hash doesn't match that of the model, cannot use it for rehydration.");
                }
                const model = (${dehydrateModel(lastModel)})(fns);
                console.log('dehydrated', model);
                return model;
              }</script>`);
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

const dehydrateModel = (model) => {
  return `(fns) => (${serialize(model)})`;

  function serialize(o) {
    if (o instanceof Array) {
      return `[${o.map(serialize).join(', ')}]`;
    } else if (typeof o === 'function' && o.name.indexOf("$") > 0) {
      return `fns.${o.name}`;
    } else if (typeof o === 'object') {
      return `{${
        Object.getOwnPropertyNames(o)
        .map(k => `"${k}": ${serialize(o[k])}`)
        .join(', ')
      }}`;
    } else if (typeof o === 'number' || typeof o === 'string' || typeof o === 'boolean') {
      return JSON.stringify(o);
    } else {
      console.log('Failed to serialize', typeof o, o);
      throw new Error(`Unserializable value in the model: ${o}`);
    }
  }
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
