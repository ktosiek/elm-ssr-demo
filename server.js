const path = require("path");
//const args = require('yargs').argv;
const express = require("express");
const fs = require("fs");
const { JSDOM } = require("jsdom");
const { Script } = require("vm");

const PORT = process.env.PORT || 8080;

const Bundler = require('parcel-bundler');
const app = express();
app.use('/static', express.static('dist'));

const file = 'index.js'; // Pass an absolute path to the entrypoint here
const options = {}; // See options section of api docs, for the possibilities

// Initialize a new bundler using a file and options
const bundler = new Bundler(file, options);
const readFile = require('util').promisify(fs.readFile);
const writeFile = require('util').promisify(fs.writeFile);

// Mangle the file a bit after build
bundler.on('buildEnd', () => {
  if (!bundler.mainBundle) return;
  const path = bundler.mainBundle.name;
  const raw = fs.readFileSync(path, {encoding: 'utf-8'});
  const mangled = raw
    .replace(
      /(var _Scheduler_queue = \[\];)\n/,
      "$1 window._Scheduler_queue = _Scheduler_queue;\n")
    .replace(
      /(function _Scheduler_enqueue\(proc\))\n{((\n[^}].+)+)/,
     "$1 { $2\nif (_Scheduler_queue.length === 0) { window._view_settled && window._view_settled(); }"
    );
  fs.writeFileSync(path, mangled);
});

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
          bundlePath: `/static/${bundle.entryAsset.id}`,
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
    try {
      dom.runVMScript(new Script(bundle.code, {filename: bundle.path}));
    } catch (err) {
      reject(err);
    }

    setTimeout(() => {
      resolve(dom.window.document.body.innerHTML);
    }, 1);
  });

const renderApp = ({bundlePath, renderedHtml}) => {
  return `<!DOCTYPE html>
<html><body>
<div id="app">${renderedHtml}</div>
<script src="${bundlePath}"></script>
</body></html>`;
}

app.listen(PORT);
