import Environment from '../src/environment';
import Router from '../src/router';
import readline from 'readline';
import { tokenize, parse } from 'r6rs';

import { WebSocketClientConnector } from 'locksmith-connector-ws';

let connector = new WebSocketClientConnector(
  'ws://localhost:23482/' + process.argv[2]);

let router = new Router(connector, false, data => {
  let environment = new Environment('', router);
  router.addSynchronizer(data.name, environment.synchronizer);
});

connector.start({
  // Not necessary though, however this is used for standalone server
  // compatibility.
  name: process.argv[2] || 'client'
});

router.on('error', (name, err) => {
  console.log((err && err.stack) || err);
});
router.on('connect', (name) => {
  console.log('Connected!', name);
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

// :/
let envKey = null;
let environment = null;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('IoTLogic-core REPL (Client)');

let backlog = '';

function getHeader() {
  if (!environment) {
    return 'not selected> ';
  } else {
    return envKey + '@' + environment.name +
      ' (' + environment.synchronizer.rtt + 'ms)> ';
  }
}

const read = (msg = getHeader()) => {
  rl.question(msg, (answer) => {
    if (/^ls$/.test(answer)) {
      console.log(Object.keys(router.synchronizers));
      read();
      return;
    }
    if (/^select (.+)$/.test(answer)) {
      let args = /^select (.+)$/.exec(answer);
      let name = args[1];
      if (router.synchronizers[name]) {
        environment = router.synchronizers[name].machine;
        envKey = name;
      }
      read();
      return;
    }
    if (environment == null) {
      console.log('Please select the environment first.');
      read();
      return;
    }
    let code = backlog + answer;
    try {
      // Dry-run the code
      parse(tokenize(code));
      backlog = '';
    } catch (e) {
      if (e.message === 'List is not closed') {
        backlog += answer + '\n';
        read('     ');
        return;
      }
      backlog = '';
      console.log(e.stack);
      read();
      return;
    }
    environment.evaluate(code)
    .then(result => {
      console.log(result);
      read();
    }, error => {
      console.log(error);
      read();
    });
  });
};

read();
