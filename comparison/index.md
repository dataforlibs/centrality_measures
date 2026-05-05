---
layout: single
title: Comparison of Centrality Measures
canonical: https://centralityzoo.github.io/comparison/
---

Currently, we provide correlation comparisons between different centrality measures
on 648 empirical networks from [Index of Complex Networks (ICON)](https://icon.colorado.edu/).

<!-- React + Babel CDN -->
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

<!-- Spinner shown while Babel compiles -->
<style>
  @keyframes czSpin { to { transform: rotate(360deg); } }
</style>

<!-- Mount point -->
<div id="comparison-root"></div>

<!-- Component — Babel compiles JSX at runtime -->
<script type="text/babel" src="/assets/js/comparison.jsx" data-presets="react"></script>
