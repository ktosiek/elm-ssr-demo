const fs = require("fs");

module.exports = (bundler) => {
  // Make sure this plugin wins for the .elm extension
  const baseLoadPlugins = bundler.loadPlugins;
  bundler.loadPlugins = async function loadPlugins() {
    await baseLoadPlugins.apply(this);
    bundler.addAssetType('elm', require.resolve('./ElmSSRAsset.js'));
  };
}

module.exports.dehydrateMultipleModels = (models, functions) => `{${
  Object.getOwnPropertyNames(models)
    .map(k => `"${k}": ${dehydrateModel(models[k], functions[k])}`)
    .join(', ')
}}`;

const dehydrateModel = module.exports.dehydrateModel = (model, fns) => {
  // Function -> name mapping
  const revFns = {};
  Object.getOwnPropertyNames(fns).map((name) => {revFns[fns[name]] = name;});

  return `(fns) => (${serialize(model)})`;

  function serialize(o) {
    if (o instanceof Array) {
      return `[${o.map(serialize).join(', ')}]`;
    } if (o === undefined || o === null) {
      return "" + o;
    } else if (typeof o === 'function' && revFns[o]) {
      return `fns.${revFns[o]}`;
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
