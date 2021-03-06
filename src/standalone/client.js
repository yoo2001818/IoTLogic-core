#!/usr/bin/env node

import Environment from '../environment';
import Router from '../router';
import fs from 'fs';
import packageInstaller from '../packageInstaller';

import { WebSocketClientConnector } from 'locksmith-connector-ws';

let config;
try {
  config = JSON.parse(fs.readFileSync('./IoTLogicConfig.json', 'utf-8'));
} catch (e) {
  console.log(e.stack);
  console.log('Cannot read config file; exiting');
  process.exit(1);
}

let connected = false;
let reconnectCounter = 0;
let globalLibs = [];

let connector = new WebSocketClientConnector(
  'ws' + config.endpoint.slice(4) + config.token);

let router = new Router(connector, false, data => {
  let environment = new Environment('', router, null, false, globalLibs);
  router.addSynchronizer(data.name, environment.synchronizer);
});

connector.start({
  initialized: false
});

function reconnect() {
  // Reconnect
  reconnectCounter ++;
  setTimeout(() => {
    connector.start({
      initialized: false
    });
  }, reconnectCounter > 3 ? 10000 : 1000);
}

function loadPackage(packages) {
  // Try to load it serially, since NPM install doesn't like parallel jobs
  let results = [];
  let promise = packages.reduce((previous, name) => {
    return previous.then(result => {
      if (result !== false) {
        results.push(result);
      }
      return packageInstaller(name);
    });
  }, Promise.resolve(false));
  return promise.then(result => {
    if (result !== false) {
      results.push(result);
    }
    return results;
  });
}

router.on('error', (name, err) => {
  console.log((err && err.stack) || err);
  if (name === true && !connected) {
    return;
  }
  // Send the error to the server. Why? Why not?
  router.connector.push({name, error: true, data: err.message});
});
router.on('connect', (name) => {
  if (name === true) {
    console.log('Connected!');
    connected = true;
    reconnectCounter = 0;
    if (router.globalData && router.globalData.data) {
      loadPackage(router.globalData.data)
      .then(results => {
        globalLibs = results;
        // OK! Acknowledge to the server..
        connector.connect({
          initialized: true
        });
      }, err => {
        // We're doomed! sort of.
        // Let's patiently wait until server disconnects the client.
        router.emit('error', null, err);
      });
    }
  }
});
router.on('disconnect', (name) => {
  if (name !== true) return;
  console.log('Disconnected!');
  connected = false;
  reconnect();
});
router.on('freeze', () => {
  console.log('Synchronizer frozen');
});
router.on('unfreeze', () => {
  console.log('Synchronizer unfrozen');
});
