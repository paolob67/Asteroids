# Version 1 (frozen baseline)

This directory holds the frozen first version of the JavaScript port of Atari Asteroids, produced with Bob (IBM Bob, Agent mode) in a single session. It is the reference point for the article that compares this first-pass port with a code modernization approach.

| Item | Value |
|------|-------|
| File | [`asteroids.html`](asteroids.html) |
| SHA-256 | `8b544821dd5fcc9328c854bb8c53a183ed4e9a93994bdc1e8465a27fbdac2d86` |
| Size | 65,686 bytes, 1,880 lines |
| Files are read-only | yes (`chmod a-w`) |

## Rules

- Do not edit `asteroids.html` or `SHA256SUMS` in this directory. All new work happens on the root [`asteroids.html`](../../asteroids.html), which started as an identical copy of this file.
- To change what "version 1" means, create `versions/v2/` instead of altering this one.

## Verify integrity

```bash
cd versions/v1 && shasum -a 256 -c SHA256SUMS
```

## Verify behaviour

```bash
scripts/run_all.sh versions/v1/asteroids.html
```

Expected result at the time of freezing: `ALL CHECKS PASSED`. See [Version 1 baseline](../../docs/VERSION_1.md) for what is in this version and what the checks cover.

## Compare a later version against v1

```bash
diff -u versions/v1/asteroids.html asteroids.html | less
diff <(node scripts/dev/rock_speed.js versions/v1/asteroids.html) \
     <(node scripts/dev/rock_speed.js asteroids.html)
```
