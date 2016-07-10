import Environment from '../src/environment';
import Router from '../src/router';
import readline from 'readline';
import { tokenize, parse } from 'r6rs';

import { WebSocketClientConnector } from 'locksmith-connector-ws';

let connector = new WebSocketClientConnector('ws://localhost:23482');

let router = new Router(connector);

connector.start({
  name: process.argv[2] || 'client'
});

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
let environment = {
  name: 'not selected',
  synchronizer: {}
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('IoTLogic-core REPL (Client)');

let backlog = '';

const read = (msg = ('scm@' + environment.name +
  ' (' + environment.synchronizer.rtt + 'ms)> ')) => {
  rl.question(msg, (answer) => {
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
