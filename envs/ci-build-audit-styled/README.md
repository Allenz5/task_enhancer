# Meridian

A headless content platform for an engineering status site. Every pipeline run is
filed as a **Build Report** entry, authored in **Meridian Studio**, classified in the
**Taxonomy manager**, and served through the separate **Delivery Console**.

## Run

```
npm install
npm start          # serves on port 5373, or $PORT
npx playwright test  # runs ground_truth.spec.ts against a server already listening
```

## Layout

```
server/data.json    the corpus -- single source of truth for every value
server/corpus.js    projects the corpus into entries, terms and stages
server/index.js     express app; each endpoint projects only what its surface may show
public/             no-build frontend (hash router, vanilla JS)
ground_truth.spec.ts  walks the app as an agent would and reconstructs the answer
```

The server is stateless: a fresh start reproduces identical results. The only
simulated latency is a fixed 300ms on the Delivery Console read API; surfaces
publish an explicit ready signal (`body[data-ready="1"]`, plus
`[data-testid="result-area"][data-query-state="ready"]`) rather than requiring a sleep.
