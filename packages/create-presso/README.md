# create-presso

Create a Markdown-native Presso presentation with npm:

```bash
npm create presso@latest my-talk
cd my-talk
npm install
npm run dev
```

`create-presso` is the command-line entry point for `npm create presso`. It uses
`@ajfisher/presso-create` to generate numbered Markdown slides, a CSS theme,
local assets, and npm scripts for serving, building, PDF export, and transcripts.

The generated deck depends on `@ajfisher/presso-server`. Existing decks do not
need to install this scaffolder or change their dependencies.

The original `npx @ajfisher/presso-create@latest my-talk` command remains supported.

See the [Presso documentation](https://github.com/ajfisher/presso#readme) for
authoring, presenting, and publishing decks.
