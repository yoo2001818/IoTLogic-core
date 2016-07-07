import Environment from '../src/environment';
import readline from 'readline';
import fs from 'fs';
import { tokenize, parse } from 'r6rs';

import { WebSocketServerConnector } from 'locksmith-connector-ws';

let connector = new WebSocketServerConnector({
  port: 23482
});

let environment = new Environment('server', connector, {
  dynamic: true,
  dynamicPushWait: 10,
  dynamicTickWait: 10,
  fixedTick: 50,
  fixedBuffer: 0,
  disconnectWait: 10000,
  freezeWait: 1000
});

if (process.argv[2]) {
  // Read payload file
  let payload = fs.readFileSync(process.argv[2], 'utf-8');
  environment.setPayload(payload);
}

environment.start();

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

console.log('IoTLogic-core REPL (Server)');

let backlog = '';

const read = (msg = 'scm@server> ') => {
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
