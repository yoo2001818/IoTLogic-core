import Environment from '../src/environment';
import Router from '../src/router';
import readline from 'readline';
import fs from 'fs';
import { tokenize, parse } from 'r6rs';

import { WebSocketServerConnector } from 'locksmith-connector-ws';

let connector = new WebSocketServerConnector({
  port: 23482
});

let router = new Router(connector, true);

function createEnvironment(name) {
  let environment = new Environment('server', router, {
    dynamic: true,
    dynamicPushWait: 10,
    dynamicTickWait: 10,
    fixedTick: 50,
    fixedBuffer: 0,
    disconnectWait: 10000,
    freezeWait: 1000
  });

  router.addSynchronizer(name, environment.synchronizer);

  if (process.argv[2]) {
    // Read payload file
    let payload = fs.readFileSync(process.argv[2], 'utf-8');
    environment.setPayload(payload);
  }
}

createEnvironment('main');
createEnvironment('test');

connector.start();

router.on('error', err => {
  console.log((err && err.stack) || err);
});
router.on('connect', () => {
  console.log('Connected!');
});
router.on('disconnect', () => {
  console.log('Disconnected!');
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

console.log('IoTLogic-core REPL (Server)');

let backlog = '';

function getHeader() {
  if (!environment) {
    return 'not selected> ';
  } else {
    return envKey + '@' + environment.name + '> ';
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
