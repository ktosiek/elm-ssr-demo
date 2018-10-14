const path = require("path");
const express = require("express");
const fs = require("fs");
const { JSDOM } = require("jsdom");
const { Script } = require("vm");
const XHRWatcher = require('./XHRWatcher');
const RAFQueueHandler = require('./RAFQueueHandler');
const ElmModelWatcher = require('./parcel-plugin-elm-ssr/ElmModelWatcher');
const elmSSR = require('./parcel-plugin-elm-ssr/index');

const PORT = process.env.PORT || 8080;
const SSR_ONLY = process.env.SSR_ONLY == '1';  // Only load the SSR view, without the actual app
const DEBUGGER = process.env.ELM_DEBUG == '1';  // Compile with the debugger
const SSR = !DEBUGGER && process.env.SSR != '0';  // Pre-render the app on the server
const HMR = SSR ? false : undefined;  // HMR breaks the focus on rehydration
console.log("Starting with options", {SSR, HMR, DEBUGGER, SSR_ONLY, PORT});

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
  hmr: HMR,
  logLevel: 4,
}; // See options section of api docs, for the possibilities

// Initialize a new bundler using a file and options
const bundler = new Bundler(file, options);
elmSSR(bundler);
const readFile = require('util').promisify(fs.readFile);
const writeFile = require('util').promisify(fs.writeFile);

// Let express use the bundler middleware, this will let Parcel handle every request over your express server
app.use(bundler.middleware());

const INITIAL_APP_HTML = '<div id="app"></div>';

app.use(async (req, res, next) => {
  const bundle = await bundler.bundle();
  const bundleScript = await readFile(bundle.name);
  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  const renderedHtml = SSR
    ? await renderElmApp({path: bundle.path, code: bundleScript}, fullUrl)
    : INITIAL_APP_HTML;

  res.send(renderApp({
    bundlePath: SSR_ONLY ? null : `/static/index.js`,
    renderedHtml,
  }));
});

const renderElmApp = async (bundle, url) => {
  const initialHtml = renderApp({
    bundlePath: null,  // we'll add the bundle later
    renderedHtml: INITIAL_APP_HTML,
  });
  const dom = new JSDOM(initialHtml, {
    url,
    runScripts: "outside-only",
  });
  const rafHandler = new RAFQueueHandler();
  rafHandler.install(dom.window);
  const xhrWatcher = new XHRWatcher();
  xhrWatcher.install(dom.window);
  const elmModelWatcher = new ElmModelWatcher();
  elmModelWatcher.install(dom.window);

  try {
    dom.runVMScript(new Script(bundle.code, {filename: bundle.path}));
    await untilStable({xhrWatcher, rafHandler});
    console.log('Pushing model state', elmModelWatcher.models);

    return `${dom.window.document.body.innerHTML}
    <script>${elmModelWatcher.getRehydrationScript()}</script>`;
  }
  catch (e) {
    console.error("Server rendering failure:", e);
    return INITIAL_APP_HTML;
  }
  finally {
    dom.window.close();
  }
}

const untilStable = async ({xhrWatcher, rafHandler}) => {
  while (!xhrWatcher.allDone || rafHandler.queue.length !== 0) {
    console.log(`Waiting for ${xhrWatcher.queue.size} XHRs and ${rafHandler.queue.length} RAFs.`)
    await xhrWatcher.untilDone();
    rafHandler.runQueue();
  }
  console.log('No pending XHR, and nothing in RAF queue: the view is stable');
};

const renderApp = ({bundlePath, renderedHtml}) => {
  return `<!DOCTYPE html>
<html><body>
${renderedHtml}
${bundlePath ? `<script src="${bundlePath}"></script>` : ""}
</body></html>`;
}

app.listen(PORT);
