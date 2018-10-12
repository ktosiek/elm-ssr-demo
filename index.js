const onLoad = (f) => {
  if (document.readyState === "complete"
      // JSDOM doesn't have support for DOMContentLoaded
      || document.visibilityState !== 'visible')
    f();
  else
    document.addEventListener('DOMContentLoaded', f);
}

onLoad(() => {
const init = () => {
  const App = require('./src/Main.elm');
  node = document.getElementById('app');
  window.app = App.Elm.Main.init({node});
};

if (document.visibilityState == 'visible')
  // Simulate slow loading
  setTimeout(init, 1000 * 5);
else
  init();
});
