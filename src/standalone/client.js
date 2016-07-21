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
});
router.on('connect', (name) => {
  console.log('Connected!', name);
  if (name === true) {
    if (router.globalData && router.globalData.data) {
      loadPackage(router.globalData.data)
      .then(results => {
        globalLibs = results;
        // OK! Acknowledge to the server..
        connector.connect({
          initialized: true
        });
      });
    }
  }
});
router.on('disconnect', (name) => {
  console.log('Disconnected!', name);
});
router.on('freeze', () => {
  console.log('Synchronizer frozen');
});
router.on('unfreeze', () => {
  console.log('Synchronizer unfrozen');
});
