# Changelog

## [0.5.0](https://github.com/ajfisher/presso/compare/@ajfisher/presso-server-v0.4.0...@ajfisher/presso-server-v0.5.0) (2026-05-31)


### Miscellaneous Chores

* **@ajfisher/presso-server:** Synchronize Presso packages versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.4.0 to ^0.5.0
    * @ajfisher/presso-create bumped from ^0.4.0 to ^0.5.0
    * @ajfisher/presso-export bumped from ^0.4.0 to ^0.5.0
    * @ajfisher/presso-runtime bumped from ^0.4.0 to ^0.5.0

## [0.4.0](https://github.com/ajfisher/presso/compare/@ajfisher/presso-server-v0.3.3...@ajfisher/presso-server-v0.4.0) (2026-05-31)


### Features

* add slide builds ([3f7693f](https://github.com/ajfisher/presso/commit/3f7693fe7554cf0edfe4b1f48ac6ef705ab93248))
* **runtime:** add click-through slide builds ([bd84159](https://github.com/ajfisher/presso/commit/bd8415958463c8a91912169fa8f9cd8aac160a9c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.3.3 to ^0.4.0
    * @ajfisher/presso-create bumped from ^0.3.3 to ^0.4.0
    * @ajfisher/presso-export bumped from ^0.3.3 to ^0.4.0
    * @ajfisher/presso-runtime bumped from ^0.3.3 to ^0.4.0

## [0.3.3](https://github.com/ajfisher/presso/compare/@ajfisher/presso-server-v0.3.2...@ajfisher/presso-server-v0.3.3) (2026-05-30)


### Miscellaneous Chores

* **@ajfisher/presso-server:** Synchronize Presso packages versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.3.2 to ^0.3.3
    * @ajfisher/presso-create bumped from ^0.3.2 to ^0.3.3
    * @ajfisher/presso-export bumped from ^0.3.2 to ^0.3.3
    * @ajfisher/presso-runtime bumped from ^0.3.2 to ^0.3.3

## [0.3.2](https://github.com/ajfisher/presso/compare/@ajfisher/presso-server-v0.3.1...@ajfisher/presso-server-v0.3.2) (2026-05-30)


### Miscellaneous Chores

* **@ajfisher/presso-server:** Synchronize Presso packages versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.3.1 to ^0.3.2
    * @ajfisher/presso-create bumped from ^0.3.1 to ^0.3.2
    * @ajfisher/presso-export bumped from ^0.3.1 to ^0.3.2
    * @ajfisher/presso-runtime bumped from ^0.3.1 to ^0.3.2

## [0.3.1](https://github.com/ajfisher/presso/compare/@ajfisher/presso-server-v0.3.0...@ajfisher/presso-server-v0.3.1) (2026-05-30)


### Miscellaneous Chores

* **@ajfisher/presso-server:** Synchronize Presso packages versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.3.0 to ^0.3.1
    * @ajfisher/presso-create bumped from ^0.3.0 to ^0.3.1
    * @ajfisher/presso-export bumped from ^0.3.0 to ^0.3.1
    * @ajfisher/presso-runtime bumped from ^0.3.0 to ^0.3.1

## [0.3.0](https://github.com/ajfisher/presso/compare/@ajfisher/presso-server-v0.2.0...@ajfisher/presso-server-v0.3.0) (2026-05-23)


### Features

* add `presso migrate reveal <source> <target>` for bootstrapping recent Reveal decks into numbered Presso folder decks ([eb7b78e](https://github.com/ajfisher/presso/commit/eb7b78ed9fcef16e88f1a6097ef5116a3172d869))
* migrate Reveal slide-level classes, image and colour backgrounds, notes, and simple timing metadata into Presso frontmatter and directives ([eb7b78e](https://github.com/ajfisher/presso/commit/eb7b78ed9fcef16e88f1a6097ef5116a3172d869))
* convert obvious Reveal `twocolumn` wrappers to nested Presso column directives and report ambiguous cases in `MIGRATION.md` ([eb7b78e](https://github.com/ajfisher/presso/commit/eb7b78ed9fcef16e88f1a6097ef5116a3172d869))


### Notes

* Reveal migration is a bootstrap tool, not a compatibility layer for Reveal themes, plugins, or broad `.element` mappings ([eb7b78e](https://github.com/ajfisher/presso/commit/eb7b78ed9fcef16e88f1a6097ef5116a3172d869))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.2.0 to ^0.3.0
    * @ajfisher/presso-create bumped from ^0.2.0 to ^0.3.0
    * @ajfisher/presso-export bumped from ^0.2.0 to ^0.3.0
    * @ajfisher/presso-runtime bumped from ^0.2.0 to ^0.3.0

## [0.2.0](https://github.com/ajfisher/presso/compare/@ajfisher/presso-server-v0.1.4...@ajfisher/presso-server-v0.2.0) (2026-05-22)


### Features

* **editing:** add dev-only edit and slide creation endpoints for folder and single-file decks ([3e8ee69](https://github.com/ajfisher/presso/commit/3e8ee6999647c125bed9f2efa5247c78192f63d2))
* **editing:** create slides in single-file decks ([31f60c3](https://github.com/ajfisher/presso/commit/31f60c3254cb3860bf9aa7bcf8876d1062f8f635))
* **editing:** support single-file writeback ([c1ebc00](https://github.com/ajfisher/presso/commit/c1ebc001d54115834049035e049eda4401c627ca))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.1.4 to ^0.2.0
    * @ajfisher/presso-create bumped from ^0.1.4 to ^0.2.0
    * @ajfisher/presso-export bumped from ^0.1.4 to ^0.2.0
    * @ajfisher/presso-runtime bumped from ^0.1.4 to ^0.2.0

## [0.1.4](https://github.com/ajfisher/presso/compare/@ajfisher/presso-server-v0.1.3...@ajfisher/presso-server-v0.1.4) (2026-05-21)


### Miscellaneous Chores

* **@ajfisher/presso-server:** Synchronize Presso packages versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.1.3 to ^0.1.4
    * @ajfisher/presso-create bumped from ^0.1.3 to ^0.1.4
    * @ajfisher/presso-export bumped from ^0.1.3 to ^0.1.4
    * @ajfisher/presso-runtime bumped from ^0.1.3 to ^0.1.4

## [0.1.3](https://github.com/ajfisher/presso/compare/@ajfisher/presso-server-v0.1.2...@ajfisher/presso-server-v0.1.3) (2026-05-21)


### Bug Fixes

* **release:** use npm trusted publishing ([0ae4be8](https://github.com/ajfisher/presso/commit/0ae4be80dc2af07a8816a097fc96f0d91c043cf5))
* **release:** use npm trusted publishing ([6ca3b2c](https://github.com/ajfisher/presso/commit/6ca3b2c81ac97703db676865f5fd0ca9e05e6f11))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.1.2 to ^0.1.3
    * @ajfisher/presso-create bumped from ^0.1.2 to ^0.1.3
    * @ajfisher/presso-export bumped from ^0.1.2 to ^0.1.3
    * @ajfisher/presso-runtime bumped from ^0.1.2 to ^0.1.3

## [0.1.2](https://github.com/ajfisher/presso/compare/@ajfisher/presso-server-v0.1.1...@ajfisher/presso-server-v0.1.2) (2026-05-21)


### Features

* add release readiness workflow ([34df543](https://github.com/ajfisher/presso/commit/34df5436c19047e28b1b68c676dacc1f5fe0480d))
* **controller:** add synced phone controller ([4012976](https://github.com/ajfisher/presso/commit/4012976f889afdf2b1d025ccc182c778da69b189)), closes [#19](https://github.com/ajfisher/presso/issues/19)
* **export:** add PDF layout exports ([f74121b](https://github.com/ajfisher/presso/commit/f74121bccf342bd010e18dea79d4d29b6b5273ce))
* **export:** add PDF layout exports ([5af6e81](https://github.com/ajfisher/presso/commit/5af6e81b814400e61a7f3ed4e2f25176d597e2f3))
* **export:** add transcript profiles ([9db250d](https://github.com/ajfisher/presso/commit/9db250d6b6a2715001b636414db47ea001727f8e))
* **export:** add transcript profiles ([9e08276](https://github.com/ajfisher/presso/commit/9e082765c9af2cb6ce926d69ae48703464de3e93))
* **release:** add release readiness workflow ([1bf3077](https://github.com/ajfisher/presso/commit/1bf307794b1b65bf7ce063946b5101f07d146934))
* scaffold presso workspace ([b62551f](https://github.com/ajfisher/presso/commit/b62551fe6dce9e66a7c059a2739692812f3766f2))


### Bug Fixes

* **runtime:** harden public notes and assets ([689281b](https://github.com/ajfisher/presso/commit/689281b56a4618b4834ae60d136b50dd3b28ef21))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.1.1 to ^0.1.2
    * @ajfisher/presso-create bumped from ^0.1.1 to ^0.1.2
    * @ajfisher/presso-export bumped from ^0.1.1 to ^0.1.2
    * @ajfisher/presso-runtime bumped from ^0.1.1 to ^0.1.2

## [0.1.1](https://github.com/ajfisher/presso/compare/@ajfisher/presso-server-v0.1.0...@ajfisher/presso-server-v0.1.1) (2026-05-21)


### Features

* add release readiness workflow ([34df543](https://github.com/ajfisher/presso/commit/34df5436c19047e28b1b68c676dacc1f5fe0480d))
* **controller:** add synced phone controller ([4012976](https://github.com/ajfisher/presso/commit/4012976f889afdf2b1d025ccc182c778da69b189)), closes [#19](https://github.com/ajfisher/presso/issues/19)
* **export:** add PDF layout exports ([f74121b](https://github.com/ajfisher/presso/commit/f74121bccf342bd010e18dea79d4d29b6b5273ce))
* **export:** add PDF layout exports ([5af6e81](https://github.com/ajfisher/presso/commit/5af6e81b814400e61a7f3ed4e2f25176d597e2f3))
* **export:** add transcript profiles ([9db250d](https://github.com/ajfisher/presso/commit/9db250d6b6a2715001b636414db47ea001727f8e))
* **export:** add transcript profiles ([9e08276](https://github.com/ajfisher/presso/commit/9e082765c9af2cb6ce926d69ae48703464de3e93))
* **release:** add release readiness workflow ([1bf3077](https://github.com/ajfisher/presso/commit/1bf307794b1b65bf7ce063946b5101f07d146934))
* scaffold presso workspace ([b62551f](https://github.com/ajfisher/presso/commit/b62551fe6dce9e66a7c059a2739692812f3766f2))


### Bug Fixes

* **runtime:** harden public notes and assets ([689281b](https://github.com/ajfisher/presso/commit/689281b56a4618b4834ae60d136b50dd3b28ef21))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @ajfisher/presso-core bumped from ^0.1.0 to ^0.1.1
    * @ajfisher/presso-create bumped from ^0.1.0 to ^0.1.1
    * @ajfisher/presso-export bumped from ^0.1.0 to ^0.1.1
    * @ajfisher/presso-runtime bumped from ^0.1.0 to ^0.1.1
