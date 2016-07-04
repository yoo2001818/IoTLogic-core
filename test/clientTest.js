import Environment from '../src/environment';
import readline from 'readline';
import { tokenize, parse } from 'r6rs';

import { WebSocketClientConnector } from 'locksmith-connector-ws';

let connector = new WebSocketClientConnector('ws://localhost:23482');

let environment = new Environment('client', connector);
connector.start();

environment.synchronizer.on('error', err => {
  console.log((err && err.stack) || err);
});
environment.synchronizer.on('connect', () => {
  console.log('Connected!');
});
environment.synchronizer.on('disconnect', () => {
  console.log('Disconnected!');
});
environment.synchronizer.on('freeze', () => {
  console.log('Synchronizer frozen');
});
environment.synchronizer.on('unfreeze', () => {
  console.log('Synchronizer unfrozen');
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('IoTLogic-core REPL (Client)');

let backlog = '';

const read = (msg = ('scm (' + environment.synchronizer.rtt + 'ms)> ')) => {
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