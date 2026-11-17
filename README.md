# witness / panel lab

[简体中文](README.zh-CN.md)

A browser tool for making, tracing and solving panels from *The Witness*. Pick an example from the library or start with a blank grid.

- **Build** a maze with gaps, hexagons, squares, stars, triangles, polyominoes or erasers. Set up sound sequences, symmetry, cylindrical boards or several panels that share a path.
- In **Trace**, draw a path by hand or place positive and negative tiles on the grid. You can align a reference photo, mark required or blocked segments, and try adding or removing RGB channels.
- **Solve** checks your path and marks conflicts. Ask for one move, search from a partial path, or browse the solutions it finds.

Panels and notes stay in browser storage. Export the panel as JSON to keep a copy or open it on another device. Larger grids can reach the search time limit.

## Run locally

Serve the `dist/` directory over HTTP. With Python 3, run this command from the repository root.

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open port 8000 on your machine in a browser. The app uses plain HTML, CSS and JavaScript modules. The puzzle rules are in [engine.mjs](dist/engine.mjs). A [Web Worker](dist/worker.mjs) runs the search off the main thread.
