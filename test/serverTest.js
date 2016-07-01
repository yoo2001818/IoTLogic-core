import Environment from '../src/environment';
import readline from 'readline';
import { tokenize, parse } from 'r6rs';

import { WebSocketServerConnector } from 'locksmith-connector-ws';

let connector = new WebSocketServerConnector({
  port: 23482
});

let environment = new Environment(connector, {
  dynamic: true,
  dynamicPushWait: 100,
  dynamicTickWait: 100,
  fixedTick: 1000,
  fixedBuffer: 0,
  disconnectWait: 10000,
  freezeWait: 2000
});
connector.start();
environment.start();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('IoTLogic-core REPL (Server)');

let backlog = '';

const read = (msg = 'scm> ') => {
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
