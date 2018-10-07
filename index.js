const App = require('./src/Main.elm');
node = document.getElementById('app');
window.app = App.Elm.Main.init({node});
window._view_settled = function () {console.log("Settled")};
