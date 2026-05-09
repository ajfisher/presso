# presso
Web based presentation framework that is useful for me

## Quick Start

```bash
make install
make check
make dev
```

The example deck lives in `examples/basic`.

Use `make dev DECK=path/to/deck PORT=3031` to run a different local deck. Raw CLI access is available with `make presso ARGS="build examples/basic"` until the package is installed globally or from a generated deck.

## Runtime Shortcuts

- `Space`, `ArrowRight`, `PageDown`: next slide
- `ArrowLeft`, `PageUp`: previous slide
- `f`: toggle fullscreen
- `p`: open speaker view
- `c`: open controller
- `n`: toggle notes when public notes are enabled
- `?`: show or hide shortcuts

## Design Notes

- [Product shape](docs/product-shape.md)
- [Authoring format](docs/authoring-format.md)
