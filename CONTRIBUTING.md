# Contributing

Thanks for helping map generative AI. Contributions of every size are welcome, from fixing a date to adding a whole branch.

## Ways to help

- **Report a factual error**: open a [data correction](https://github.com/seamys/ai-tech-tree/issues/new?template=data-correction.yml) issue with a source.
- **Propose a node**: open a [new node](https://github.com/seamys/ai-tech-tree/issues/new?template=new-node.yml) issue, or add it to `data/nodes.json` in a pull request.
- **Report a bug or suggest a feature**: use the [bug report](https://github.com/seamys/ai-tech-tree/issues/new?template=bug-report.yml) template.
- **Improve the code**: see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first.

## What counts as a node

A node is either a **breakthrough** (a paper, release or event that changed what is possible or how the field works) or a **constraint** (a policy, supply, power or legal limit that shaped it). Before adding one, check that:

1. **It has a primary source.** Use the paper, official announcement or regulator notice. Avoid aggregators.
2. **It has at least one criterion** from `data/taxonomy.json` explaining why it matters, such as `new-paradigm`, `mass-adoption` or `supply-constraint`.
3. **The date is as precise as the source allows.** Use `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, and don't invent precision the source doesn't give.
4. **Both languages are filled in.** The `title` and `summary` fields each need `zh` and `en`. Write summaries in your own words, in one or two sentences.
5. **`geo` follows one rule.** Papers and releases use the headquarters of the main institution (a university's campus). Physical events use the actual site. Policies and legal actions use the issuing jurisdiction as `origin` and add the affected parties with `"role": "target"`. If there is no single place (a global trend, a distributed dataset), leave `geo` out.
6. **`level` is honest.** `1` is reserved for true milestones. Most new nodes should be `2` or `3`.

Schema reference: [data/schema/node.schema.json](data/schema/node.schema.json).

## Development

```bash
npm install
npm run dev        # local server with rebuild on change
npm run check      # validate data + type-check (CI runs the same)
npm run build
```

## Pull requests

- Keep each PR focused: one topic, data or code.
- Run `npm run check` before pushing.
- For data PRs, put the source links in the PR description.
- Write commit messages in English, in the imperative mood ("Add Rubin node", not "Added").

By contributing you agree that your code is licensed under MIT and your data under CC BY 4.0. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
