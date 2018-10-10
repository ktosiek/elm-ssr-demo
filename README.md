# Elm SSR Experiments

Experiment in building an SSR app in Elm.

The server is heavily inspired by [spades](https://github.com/rogeriochaves/spades), but adds some new stuff (basically most of the TODO :-)).
The way of breaking into the runtime is heavily inspired by [elm-hot](https://github.com/klazuka/elm-hot/blob/) - I wouldn't be brave enough to try without elm-hot leading the way.

TODO:
* [x] Render a simple view
* [ ] Keep focus after rehydration
* [ ] Keep inputs state after rehydration
* [x] Rehydrate the state from the server
* [x] Handle functions in model (kind of)
* [ ] Handle the navigation key
* [x] Download data on the server / wait for a stable state
* [ ] Integrate with parcel-plugin-elm-hot (I've broken the integration somehow)
* [ ] Test with --optimize and --debug
* [ ] Check that the model matches the bundle before rehydration
