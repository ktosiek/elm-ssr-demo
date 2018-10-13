const fs = require("fs");

module.exports = (bundler) => {
  bundler.addAssetType('elm', require.resolve('./ElmSSRAsset.js'));
}

module.exports.dehydrateMultipleModels = (models) => `{${
  Object.getOwnPropertyNames(models)
    .map(k => `"${k}": ${dehydrateModel(models[k])}`)
    .join(', ')
}}`;

const dehydrateModel = module.exports.dehydrateModel = (model) => {
  return `(fns) => (${serialize(model)})`;

  function serialize(o) {
    if (o instanceof Array) {
      return `[${o.map(serialize).join(', ')}]`;
    } if (o === undefined || o === null) {
      return "" + o;
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
