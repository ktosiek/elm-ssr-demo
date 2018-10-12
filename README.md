# Elm SSR Experiments

Experiment in building an SSR app in Elm.

The server is heavily inspired by [spades](https://github.com/rogeriochaves/spades), but adds some new stuff (basically most of [the TODO](#TODO) :-)).
The way of breaking into the runtime is heavily inspired by [elm-hot](https://github.com/klazuka/elm-hot/blob/) - I wouldn't be brave enough to try without elm-hot leading the way.

# <a name="TODO"></a>TODO:
* [x] Render a simple view
* [x] Keep focus after rehydration (but see [Limitations](#limitations))
* [ ] Keep inputs state after rehydration
* [x] Rehydrate the state from the server
* [x] Handle functions in model (kind of)
* [ ] Handle the navigation key
* [x] Download data on the server / wait for a stable state
* [ ] Integrate with parcel-plugin-elm-hot (I've broken the integration somehow)
* [ ] Test with --optimize and --debug
* [ ] Check that the model matches the bundle before rehydration
* [ ] The Flick - the screen flicks when hydrating

# <a name="limitations"></a>Limitations:
Those are left out of the demo on purpose, mostly because of difficulties with Elm 0.19 output:
* Only works well with `Browser.element` - `document` and `application` remove existing DOM before attaching.
* Only top-level, named functions can be serialized - using a closure or anonymous function will cause a failure on the server.
