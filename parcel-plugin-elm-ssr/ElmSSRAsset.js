const ElmAsset = require('parcel-bundler/src/assets/ElmAsset');

const CmdNone = { '$': 2, m: { '$': '[]' } };

class ElmSSRAsset extends ElmAsset {
  async parse() {
    await super.parse();
    this.contents = inject(this.contents);
  }
}

module.exports = ElmSSRAsset;

// Inject the stepperBuilder wrapper into the code bundle
const inject = (raw) => {
  const buildId = md5(raw)
  let mangled = raw
  mangled = checkReplace(mangled,
      /(function _Platform_initialize\([^)]+\))\n{/,
      `$1 {
        if (window.stepperBuilderWrapper)
          stepperBuilder = window.stepperBuilderWrapper("${buildId}", stepperBuilder);
        if (window.buildSSRModel) {
          try {
            const model = window.buildSSRModel("${buildId}", fns);
            init = () => ({ "$": '#2', a: model, b: ${JSON.stringify(CmdNone)}});
            window._hydration_error = null;
          } catch (e) {
            window._hydration_error = e;
            console.error("Hydration failed:", e);
          }
        }
      `);
  mangled = checkReplace(mangled,
      /\nfunction F\(arity, fun, wrapper\) {/,
      "\nvar fns = {}; function F(arity, fun, wrapper) {");
  mangled = checkReplace(mangled,
      // TODO: This should handle all unicode letters, not just [0-9],
      // but node doesn't have a class for all letters.
      /\nvar ([\w\d]+\$[\w\d$]+) = function /gu,
      "\nvar $1 =fns.$1 = function $1 ");
  console.log('mangled from', raw.length, 'to', mangled.length)
  return mangled;
}

const checkReplace = (raw, regexp, subst, minDiff) => {
  const mangled = raw.replace(regexp, subst);
  const diff = mangled.length - raw.length;
  if (diff < (minDiff || 1)) {
    throw new Error("Mangling failed on regexp", regexp);
  }
  return mangled;
}

const md5 = (content) => {
  const crypto = require('crypto');
  const hash = crypto.createHash('md5');
  hash.update(content);
  return hash.digest('base64');
}
