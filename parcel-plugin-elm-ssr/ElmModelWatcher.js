const elmSSR = require('.');


module.exports = class ElmModelWatcher {
  constructor() {
    this.models = {};
    this.functions = {};
  }

  install(window) {
    window._on_model_step = (buildId, model) => {
      console.log('Model step', model);
      this.models[buildId] = model;
    }
    window.stepperBuilderWrapper = (buildId, fns, stepperBuilder) => {
      this.functions[buildId] = fns;
      return (sendToApp, initialModel) => {
        const baseStepper = stepperBuilder(sendToApp, initialModel);
        return (nextModel, isSync) => {
          window._on_model_step(buildId, nextModel);
          return baseStepper(nextModel, isSync);
        }
      }
    };
  }

  getRehydrationScript() {
    return `(() => {
      const models = (${elmSSR.dehydrateMultipleModels(this.models, this.functions)});
      window.buildSSRModel = (buildId, fns) => {
        const modelFn = models[buildId];
        if (!modelFn) {
          throw new Error("Build id doesn't match that of a model, cannot use it for rehydration.");
        }
        const model = modelFn(fns);
        console.log('dehydrated', model);
        return model;
      };
    })();`;
  }
}
