# Changelog

## [0.5.1](https://github.com/ajfisher/presso/compare/@ajfisher/presso-runtime-v0.5.0...@ajfisher/presso-runtime-v0.5.1) (2026-05-31)


### Miscellaneous Chores

* **@ajfisher/presso-runtime:** Synchronize Presso packages versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.5.0 to ^0.5.1

## [0.5.0](https://github.com/ajfisher/presso/compare/@ajfisher/presso-runtime-v0.4.0...@ajfisher/presso-runtime-v0.5.0) (2026-05-31)


### ⚠ BREAKING CHANGES

* **runtime:** Deck and embed modes now render slides against the canonical slide canvas and uniformly transform-scale them, which can affect theme or runtime CSS assumptions that relied on viewport-sized slide boxes.

### Bug Fixes

* **runtime:** scale deck and embed slides from a fixed canvas ([6878f39](https://github.com/ajfisher/presso/commit/6878f398ace773fef676ef0b0c637f2d92d73a2d)), closes [#111](https://github.com/ajfisher/presso/issues/111)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.4.0 to ^0.5.0

## [0.4.0](https://github.com/ajfisher/presso/compare/@ajfisher/presso-runtime-v0.3.3...@ajfisher/presso-runtime-v0.4.0) (2026-05-31)


### Features

* add slide builds ([3f7693f](https://github.com/ajfisher/presso/commit/3f7693fe7554cf0edfe4b1f48ac6ef705ab93248))
* **core:** support nested column builds ([096382e](https://github.com/ajfisher/presso/commit/096382eb9cd2f427c799a7f524006123245eaa28))
* **runtime:** add click-through slide builds ([bd84159](https://github.com/ajfisher/presso/commit/bd8415958463c8a91912169fa8f9cd8aac160a9c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.3.3 to ^0.4.0

## [0.3.3](https://github.com/ajfisher/presso/compare/@ajfisher/presso-runtime-v0.3.2...@ajfisher/presso-runtime-v0.3.3) (2026-05-30)


### Bug Fixes

* **runtime:** inherit presenter note bullet sizing ([a442180](https://github.com/ajfisher/presso/commit/a442180811b9555096f937d275d40a9496a44faf))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.3.2 to ^0.3.3

## [0.3.2](https://github.com/ajfisher/presso/compare/@ajfisher/presso-runtime-v0.3.1...@ajfisher/presso-runtime-v0.3.2) (2026-05-30)


### Bug Fixes

* **core:** render speaker note soft wraps as paragraphs ([2d490d7](https://github.com/ajfisher/presso/commit/2d490d74e467a0c7925f014dd708e4c344ef3e3b)), closes [#100](https://github.com/ajfisher/presso/issues/100)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.3.1 to ^0.3.2

## [0.3.1](https://github.com/ajfisher/presso/compare/@ajfisher/presso-runtime-v0.3.0...@ajfisher/presso-runtime-v0.3.1) (2026-05-30)


### Bug Fixes

* **runtime:** isolate presenter chrome from deck themes ([dab813e](https://github.com/ajfisher/presso/commit/dab813e648d6aae1f458087765fa163c9d59adc1)), closes [#95](https://github.com/ajfisher/presso/issues/95)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.3.0 to ^0.3.1

## [0.3.0](https://github.com/ajfisher/presso/compare/@ajfisher/presso-runtime-v0.2.0...@ajfisher/presso-runtime-v0.3.0) (2026-05-23)


### Features

* render explicit `data-background` hooks and background CSS custom properties instead of relying on inline-style sniffing ([eb7b78e](https://github.com/ajfisher/presso/commit/eb7b78ed9fcef16e88f1a6097ef5116a3172d869))
* default image background overlays to `none`, with scrims available only when opted in through slide metadata ([eb7b78e](https://github.com/ajfisher/presso/commit/eb7b78ed9fcef16e88f1a6097ef5116a3172d869))
* add the `image-title` full-bleed image layout and starter CSS for semantic `.presso-column` output ([eb7b78e](https://github.com/ajfisher/presso/commit/eb7b78ed9fcef16e88f1a6097ef5116a3172d869))
* improve logo and column starter styling so migrated Markdown image groups render cleanly without deck-specific paragraph hacks ([eb7b78e](https://github.com/ajfisher/presso/commit/eb7b78ed9fcef16e88f1a6097ef5116a3172d869))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.2.0 to ^0.3.0

## [0.2.0](https://github.com/ajfisher/presso/compare/@ajfisher/presso-runtime-v0.1.4...@ajfisher/presso-runtime-v0.2.0) (2026-05-22)


### Features

* **editing:** add tabbed local editor UI with layout picker and source writeback ([3e8ee69](https://github.com/ajfisher/presso/commit/3e8ee6999647c125bed9f2efa5247c78192f63d2))
* **editing:** create slides in single-file decks ([31f60c3](https://github.com/ajfisher/presso/commit/31f60c3254cb3860bf9aa7bcf8876d1062f8f635))
* **editing:** support single-file writeback ([c1ebc00](https://github.com/ajfisher/presso/commit/c1ebc001d54115834049035e049eda4401c627ca))


### Bug Fixes

* **editing:** keep created slide editor pending across reloads ([4696aa7](https://github.com/ajfisher/presso/commit/4696aa767cd7bac12ba64efe5f48d53b55695b94))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.1.4 to ^0.2.0

## [0.1.4](https://github.com/ajfisher/presso/compare/@ajfisher/presso-runtime-v0.1.3...@ajfisher/presso-runtime-v0.1.4) (2026-05-21)


### Miscellaneous Chores

* **@ajfisher/presso-runtime:** Synchronize Presso packages versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.1.3 to ^0.1.4

## [0.1.3](https://github.com/ajfisher/presso/compare/@ajfisher/presso-runtime-v0.1.2...@ajfisher/presso-runtime-v0.1.3) (2026-05-21)


### Bug Fixes

* **release:** use npm trusted publishing ([0ae4be8](https://github.com/ajfisher/presso/commit/0ae4be80dc2af07a8816a097fc96f0d91c043cf5))
* **release:** use npm trusted publishing ([6ca3b2c](https://github.com/ajfisher/presso/commit/6ca3b2c81ac97703db676865f5fd0ca9e05e6f11))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.1.2 to ^0.1.3

## [0.1.2](https://github.com/ajfisher/presso/compare/@ajfisher/presso-runtime-v0.1.1...@ajfisher/presso-runtime-v0.1.2) (2026-05-21)


### Features

* add presentation shortcuts ([89cc3c9](https://github.com/ajfisher/presso/commit/89cc3c933e8f83c65b35948675ccd2cdcf8c89e9))
* add release readiness workflow ([34df543](https://github.com/ajfisher/presso/commit/34df5436c19047e28b1b68c676dacc1f5fe0480d))
* **controller:** add synced phone controller ([4012976](https://github.com/ajfisher/presso/commit/4012976f889afdf2b1d025ccc182c778da69b189)), closes [#19](https://github.com/ajfisher/presso/issues/19)
* **export:** add PDF layout exports ([f74121b](https://github.com/ajfisher/presso/commit/f74121bccf342bd010e18dea79d4d29b6b5273ce))
* **export:** add transcript profiles ([9db250d](https://github.com/ajfisher/presso/commit/9db250d6b6a2715001b636414db47ea001727f8e))
* **export:** add transcript profiles ([9e08276](https://github.com/ajfisher/presso/commit/9e082765c9af2cb6ce926d69ae48703464de3e93))
* **release:** add release readiness workflow ([1bf3077](https://github.com/ajfisher/presso/commit/1bf307794b1b65bf7ce063946b5101f07d146934))
* **runtime:** add first and last slide shortcuts ([16b9c6f](https://github.com/ajfisher/presso/commit/16b9c6f86ba5a95774df29c9f68fa3e82df986f3)), closes [#46](https://github.com/ajfisher/presso/issues/46)
* **runtime:** add presenter teleprompter ([4f353f9](https://github.com/ajfisher/presso/commit/4f353f9d8cb8c4cd7ccbe6f6cb365df4289d9312))
* **runtime:** add printable speaker layouts ([4f96e99](https://github.com/ajfisher/presso/commit/4f96e99c20a33fb8d88ff74a517ac07bf57d650c))
* **runtime:** add starter layout coverage ([adc0f15](https://github.com/ajfisher/presso/commit/adc0f15aac5eb4a706ffc0de6de2b2b771e14a05)), closes [#11](https://github.com/ajfisher/presso/issues/11)
* **runtime:** compact presenter control surface ([0be15a4](https://github.com/ajfisher/presso/commit/0be15a4f6d02b0c4142188246b961300622e6a73))
* **runtime:** group presenter controls ([9f320eb](https://github.com/ajfisher/presso/commit/9f320ebb6d5cebe86a4d32d99372efc9e21b36c1))
* **runtime:** improve presenter rehearsal view ([a6e5f81](https://github.com/ajfisher/presso/commit/a6e5f81dcbc23427729890086a3e7a382213ba12)), closes [#18](https://github.com/ajfisher/presso/issues/18)
* **runtime:** refine presenter utility controls ([d689627](https://github.com/ajfisher/presso/commit/d6896270174f71e4e18a8b9781845057976e33a9))
* **runtime:** refine teleprompter pace and progress ([4921faa](https://github.com/ajfisher/presso/commit/4921faadf39e63b139586d01c1d9ae0a3ac1bf71))
* scaffold presso workspace ([b62551f](https://github.com/ajfisher/presso/commit/b62551fe6dce9e66a7c059a2739692812f3766f2))


### Bug Fixes

* **runtime:** auto-hide presentation controls ([0a44df2](https://github.com/ajfisher/presso/commit/0a44df2f3a545efc8ab2147a959d7ab2514f9e40)), closes [#43](https://github.com/ajfisher/presso/issues/43)
* **runtime:** constrain deck viewport sizing ([42fb235](https://github.com/ajfisher/presso/commit/42fb23534620dc8040e965c815e356bf49bfb982)), closes [#37](https://github.com/ajfisher/presso/issues/37)
* **runtime:** correct presentation progress interpolation ([50d607c](https://github.com/ajfisher/presso/commit/50d607c8d9bf49cb68f729b9dafa56210577636d)), closes [#42](https://github.com/ajfisher/presso/issues/42)
* **runtime:** harden controller route scoping ([1af5e24](https://github.com/ajfisher/presso/commit/1af5e2430aa111a95171f3e1f61694276a3fade7))
* **runtime:** harden public notes and assets ([689281b](https://github.com/ajfisher/presso/commit/689281b56a4618b4834ae60d136b50dd3b28ef21))
* **runtime:** inherit presenter slide count sizing ([66e9ac3](https://github.com/ajfisher/presso/commit/66e9ac3b7a86c66ceeb04ee97e82f90f97e21d2a))
* **runtime:** keep presenter previews visible ([b9921fb](https://github.com/ajfisher/presso/commit/b9921fb297c7ec539507b052cf6949696648c86e))
* **runtime:** match presenter preview letterboxing ([bd437b3](https://github.com/ajfisher/presso/commit/bd437b335032235063db3c1c483106ba27e95010))
* **runtime:** report teleprompter progress precisely ([34430ac](https://github.com/ajfisher/presso/commit/34430acbedad321e97f68c9d0b8817f936f404e4))
* **runtime:** scale presenter slide previews ([fdf7671](https://github.com/ajfisher/presso/commit/fdf7671f660d03f131689f7aa4eed14e7bf75ebd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.1.1 to ^0.1.2

## [0.1.1](https://github.com/ajfisher/presso/compare/@ajfisher/presso-runtime-v0.1.0...@ajfisher/presso-runtime-v0.1.1) (2026-05-21)


### Features

* add presentation shortcuts ([89cc3c9](https://github.com/ajfisher/presso/commit/89cc3c933e8f83c65b35948675ccd2cdcf8c89e9))
* add release readiness workflow ([34df543](https://github.com/ajfisher/presso/commit/34df5436c19047e28b1b68c676dacc1f5fe0480d))
* **controller:** add synced phone controller ([4012976](https://github.com/ajfisher/presso/commit/4012976f889afdf2b1d025ccc182c778da69b189)), closes [#19](https://github.com/ajfisher/presso/issues/19)
* **export:** add PDF layout exports ([f74121b](https://github.com/ajfisher/presso/commit/f74121bccf342bd010e18dea79d4d29b6b5273ce))
* **export:** add transcript profiles ([9db250d](https://github.com/ajfisher/presso/commit/9db250d6b6a2715001b636414db47ea001727f8e))
* **export:** add transcript profiles ([9e08276](https://github.com/ajfisher/presso/commit/9e082765c9af2cb6ce926d69ae48703464de3e93))
* **release:** add release readiness workflow ([1bf3077](https://github.com/ajfisher/presso/commit/1bf307794b1b65bf7ce063946b5101f07d146934))
* **runtime:** add first and last slide shortcuts ([16b9c6f](https://github.com/ajfisher/presso/commit/16b9c6f86ba5a95774df29c9f68fa3e82df986f3)), closes [#46](https://github.com/ajfisher/presso/issues/46)
* **runtime:** add presenter teleprompter ([4f353f9](https://github.com/ajfisher/presso/commit/4f353f9d8cb8c4cd7ccbe6f6cb365df4289d9312))
* **runtime:** add printable speaker layouts ([4f96e99](https://github.com/ajfisher/presso/commit/4f96e99c20a33fb8d88ff74a517ac07bf57d650c))
* **runtime:** add starter layout coverage ([adc0f15](https://github.com/ajfisher/presso/commit/adc0f15aac5eb4a706ffc0de6de2b2b771e14a05)), closes [#11](https://github.com/ajfisher/presso/issues/11)
* **runtime:** compact presenter control surface ([0be15a4](https://github.com/ajfisher/presso/commit/0be15a4f6d02b0c4142188246b961300622e6a73))
* **runtime:** group presenter controls ([9f320eb](https://github.com/ajfisher/presso/commit/9f320ebb6d5cebe86a4d32d99372efc9e21b36c1))
* **runtime:** improve presenter rehearsal view ([a6e5f81](https://github.com/ajfisher/presso/commit/a6e5f81dcbc23427729890086a3e7a382213ba12)), closes [#18](https://github.com/ajfisher/presso/issues/18)
* **runtime:** refine presenter utility controls ([d689627](https://github.com/ajfisher/presso/commit/d6896270174f71e4e18a8b9781845057976e33a9))
* **runtime:** refine teleprompter pace and progress ([4921faa](https://github.com/ajfisher/presso/commit/4921faadf39e63b139586d01c1d9ae0a3ac1bf71))
* scaffold presso workspace ([b62551f](https://github.com/ajfisher/presso/commit/b62551fe6dce9e66a7c059a2739692812f3766f2))


### Bug Fixes

* **runtime:** auto-hide presentation controls ([0a44df2](https://github.com/ajfisher/presso/commit/0a44df2f3a545efc8ab2147a959d7ab2514f9e40)), closes [#43](https://github.com/ajfisher/presso/issues/43)
* **runtime:** constrain deck viewport sizing ([42fb235](https://github.com/ajfisher/presso/commit/42fb23534620dc8040e965c815e356bf49bfb982)), closes [#37](https://github.com/ajfisher/presso/issues/37)
* **runtime:** correct presentation progress interpolation ([50d607c](https://github.com/ajfisher/presso/commit/50d607c8d9bf49cb68f729b9dafa56210577636d)), closes [#42](https://github.com/ajfisher/presso/issues/42)
* **runtime:** harden controller route scoping ([1af5e24](https://github.com/ajfisher/presso/commit/1af5e2430aa111a95171f3e1f61694276a3fade7))
* **runtime:** harden public notes and assets ([689281b](https://github.com/ajfisher/presso/commit/689281b56a4618b4834ae60d136b50dd3b28ef21))
* **runtime:** inherit presenter slide count sizing ([66e9ac3](https://github.com/ajfisher/presso/commit/66e9ac3b7a86c66ceeb04ee97e82f90f97e21d2a))
* **runtime:** keep presenter previews visible ([b9921fb](https://github.com/ajfisher/presso/commit/b9921fb297c7ec539507b052cf6949696648c86e))
* **runtime:** match presenter preview letterboxing ([bd437b3](https://github.com/ajfisher/presso/commit/bd437b335032235063db3c1c483106ba27e95010))
* **runtime:** report teleprompter progress precisely ([34430ac](https://github.com/ajfisher/presso/commit/34430acbedad321e97f68c9d0b8817f936f404e4))
* **runtime:** scale presenter slide previews ([fdf7671](https://github.com/ajfisher/presso/commit/fdf7671f660d03f131689f7aa4eed14e7bf75ebd))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.1.0 to ^0.1.1
