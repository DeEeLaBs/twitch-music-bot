import { setDefaultAutoSelectFamily } from 'node:net';

// Node's Happy Eyeballs path resets TLS handshakes to Twitch on Windows.
// The Helix call then throws "fetch failed" even though the same URL answers.
setDefaultAutoSelectFamily(false);
