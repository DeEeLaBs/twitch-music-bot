# Plugins (v1.4)

Optionale lokale Erweiterungen können als `.mjs` oder `.js` in diesem Ordner abgelegt werden.

```js
export default {
  name: 'Mein Plugin',
  version: '1.0.0',
  setup({ log }) {
    log('Plugin geladen');
  }
};
```

Plugins laufen lokal mit den Rechten des Bot-Prozesses. Installiere deshalb nur Code, dem du vertraust.
