#!/usr/bin/env node

import fs from 'fs';
import prompt from 'prompt';
import requestLib from 'request';
import colors from 'colors/safe';

const ENDPOINT = process.argv[2] || 'http://iotlogic.kkiro.kr/';

let user = null;
let devices = null;
let device = null;

const request = requestLib.defaults({
  jar: true,
  baseUrl: ENDPOINT + 'api/'
});

prompt.message = '?';
prompt.start();

function checkConfigFile(callback) {
  fs.access('./IoTLogicConfig.json', fs.constants.F_OK, err => {
    callback(!err);
  });
}

function askConflict() {
  prompt.get([{
    name: 'override',
    description: 'y/n',
    pattern: /^(y|n)$/,
    message: 'Please type y/n'
  }], (err, result) => {
    if (err) console.log(err.stack);
    if (result.override === 'y') {
      promptCredentials();
    } else {
      console.log(colors.white('Stopping.'));
    }
  });
}

function promptCredentials(noDisplay = false) {
  if (!noDisplay) {
    console.log(colors.green('Using endpoint ' + ENDPOINT));
    console.log(colors.white('Please log in to the server.'));
  }
  prompt.get([{
    name: 'username'
  }, {
    name: 'password',
    hidden: true
  }], (err, result) => {
    if (err) {
      console.log(err.stack);
      return;
    }
    request.post({
      url: '/user/login', json: true, body: result
    }, (err, response) => {
      if (err) {
        console.log(err.stack);
        return;
      }
      if (response.statusCode !== 200) {
        console.log('error: ' + colors.red(response.body.message));
        promptCredentials(true);
        return;
      }
      user = response.body;
      console.log(colors.green(`Logged in as ${user.username} (${user.name})`));
      loadDeviceList();
    });
  });
}

function loadDeviceList() {
  request.get({
    url: '/devices', json: true
  }, (err, response) => {
    if (err) {
      console.log(err.stack);
      return;
    }
    if (response.statusCode !== 200) {
      console.log('error: ' + colors.red(response.body.message));
      return;
    }
    devices = response.body;
    console.log(colors.white(
      'Currently following PC (Node.js) devices are available.'));
    let pcDevices = devices.filter(device => device.type === 'pc');
    function askDeviceId() {
      prompt.get([{
        name: 'id',
        description: 'Type number'
      }], (err, result) => {
        if (err) {
          console.log(err.stack);
          return;
        }
        if (result.id === '') {
          createNewDevice();
        } else {
          let id = parseInt(result.id) - 1;
          if (pcDevices[id] == null) {
            askDeviceId();
            return;
          }
          regenerateDevice(pcDevices[id]);
        }
      });
    }
    if (pcDevices.length > 0) {
      pcDevices.forEach((device, index) => {
        let name = device.alias ? `${device.alias} (${device.name})` :
          device.name;
        let footer = device.connected ? '(Connected)' : '';
        console.log(`${index + 1}. ${name} ${footer}`);
      });
      console.log(
        colors.white('Please type the number to use the device, or leave it ' +
        'blank to create new.'));
      console.log(colors.white('Please note that using existing device will ' +
        'disconnect already connected one.'));
      askDeviceId();
    } else {
      createNewDevice();
    }
  });
}

function regenerateDevice(obj) {
  let name = obj.alias ? `${obj.alias} (${obj.name})` :
    obj.name;
  console.log(colors.white('Selected device ' + name));
  request.post({
    url: '/devices/' + obj.name + '/token', json: true
  }, (err, response) => {
    if (err) {
      console.log(err.stack);
      return;
    }
    if (response.statusCode !== 200) {
      console.log('error: ' + colors.red(response.body.message));
      return;
    }
    device = response.body;
    writeConfig();
  });
}

function createNewDevice(noDisplay = false) {
  if (!noDisplay) {
    console.log(colors.white('Creating new device.'));
  }
  prompt.get([{
    name: 'name',
    description: 'ID'
  }, {
    name: 'alias',
    description: 'Alias'
  }], (err, result) => {
    if (err) {
      console.log(err.stack);
      return;
    }
    result.type = 'pc';
    request.post({
      url: '/devices', json: true, body: result
    }, (err, response) => {
      if (err) {
        console.log(err.stack);
        return;
      }
      if (response.statusCode !== 200) {
        if (response.body.id === 'VALIDATION_ERROR') {
          if (response.body.type === 'ErrorValidationDevicePolicy') {
            console.log('error: ' + colors.red('Device ID is invalid.'));
          } else if (response.body.type === 'ErrorValidationConflict') {
            console.log('error: ' + colors.red('Device ID conflicts.'));
          } else {
            console.log('error: ' + colors.red(response.body.type));
          }
          createNewDevice(true);
          return;
        }
        console.log('error: ' + colors.red(response.body.message));
        createNewDevice(true);
        return;
      }
      device = response.body;
      writeConfig();
    });
  });
}

function writeConfig() {
  fs.writeFileSync('./IoTLogicConfig.json', JSON.stringify({
    endpoint: ENDPOINT,
    token: device.token,
    reconnect: true
  }));
  console.log(colors.white('Configuration saved'));
  console.log(colors.white('Complete!'));
}

console.log('IoTLogic configuration wizard');
console.log('-----------------------------');

checkConfigFile(result => {
  if (result) {
    console.log(colors.red('Configuration file already exists!'));
    console.log(colors.white('Do you want to override it?'));
    askConflict();
  } else {
    promptCredentials();
  }
});
