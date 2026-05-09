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

## Design Notes

- [Product shape](docs/product-shape.md)
- [Authoring format](docs/authoring-format.md)
