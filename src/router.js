import { EventEmitter } from 'events';
const debug = require('debug')('IoTLogic:router');

// This delegates between the synchronizer and connector, allowing multiple
// synchronizers to be attached in single connector.
// Synchronizer will assume that this is an connector, while connector will
// assume that this is an synchronizer.
export default class Router extends EventEmitter {
  constructor(connector, host, connectHandler) {
    super();
    this.connector = connector;
    this.connector.synchronizer = this;
    this.host = host;
    this.synchronizers = {};
    this.connectHandler = connectHandler;
    this.globalData = null;
  }
  addSynchronizer(name, synchronizer) {
    debug('Synchronizer ' + name + ' added');
    this.synchronizers[name] = synchronizer;
    // Create a shim object for hooking
    synchronizer.connector = {
      getHostId: () => {
        return this.connector.getHostId();
      },
      getClientId: () => {
        return this.connector.getClientId();
      },
      push: (data, clientId) => {
        debug('Sending push from ' + name);
        this.connector.push({ name, data }, clientId);
      },
      ack: (data, clientId) => {
        debug('Sending ack from ' + name);
        this.connector.ack({ name, data }, clientId);
      },
      connect: (data, clientId) => {
        debug('Sending connect from ' + name);
        // Send client ID too
        this.connector.connect({ name, data, id: data.id }, clientId);
      },
      disconnect: (clientId) => {
        debug('Sending disconnect from ' + name);
        this.connector.push({ name, disconnect: true }, clientId);
      },
      error: (data, clientId) => {
        debug('Sending error from ' + name);
        this.connector.error({ name, data }, clientId);
      }
    };
    // Is this necessary?
    synchronizer.on('start', this.emit.bind(this, 'start', name));
    synchronizer.on('stop', this.emit.bind(this, 'stop', name));
    synchronizer.on('connect', this.emit.bind(this, 'connect', name));
    synchronizer.on('disconnect', this.emit.bind(this, 'disconnect', name));
    synchronizer.on('freeze', this.emit.bind(this, 'freeze', name));
    synchronizer.on('unfreeze', this.emit.bind(this, 'unfreeze', name));
    synchronizer.on('error', this.emit.bind(this, 'error', name));
    synchronizer.on('tick', this.emit.bind(this, 'tick', name));
    // TODO Shouldn't we send connect event to other clients?
  }
  removeSynchronizer(name) {
    delete this.synchronizers[name];
  }
  start(data) {
    debug('Starting up');
    // Start every synchronizer with given data.
    if (!this.host) return;
    for (let key in this.synchronizers) {
      this.synchronizers[key].start(data);
    }
  }
  stop() {
    // What?
  }
  handlePush(data, clientId) {
    if (!this.validateData(data, clientId)) return;
    if (data.disconnect) {
      debug('Received disconnect from ' + data.name);
      this.synchronizers[data.name].handleDisconnect(data.data, clientId);
      if (!this.host) {
        this.removeSynchronizer(data.name);
      }
      return;
    }
    debug('Received push from ' + data.name);
    this.synchronizers[data.name].handlePush(data.data, clientId);
  }
  handleAck(data, clientId) {
    if (!this.validateData(data, clientId)) return;
    debug('Received ack from ' + data.name);
    this.synchronizers[data.name].handleAck(data.data, clientId);
  }
  handleConnect(data, clientId) {
    if (this.host) {
      debug('Connection received');
      if (this.connectHandler) {
        this.emit('connect', true, clientId);
        this.connectHandler(data, clientId);
      } else {
        // Just to emit connect event on the client side.
        this.emit('connect', true, clientId);
        this.connector.connect({
          global: true
        }, clientId);
        for (let key in this.synchronizers) {
          this.synchronizers[key].handleConnect(data, clientId);
        }
      }
    } else {
      if (data && data.global) {
        debug('Received global connection');
        this.globalData = data.data;
        // Clients need to call router.connector.connect('ok'); to continue
        // connection. :S
        this.emit('connect', true, clientId, data.data);
        return;
      }
      // Create synchronizer if it doesn't exists.
      if (data && this.synchronizers[data.name] == null) {
        debug('Creating synchronizer ' + data.name);
        if (this.connectHandler) this.connectHandler(data);
      }
      if (!this.validateData(data, clientId)) return;
      debug('Received connection from ' + data.name);
      this.synchronizers[data.name].handleConnect(data.data, clientId);
    }
  }
  handleError(data, clientId) {
    if (data == null || (!data.global && data.data == null)) {
      debug('Received an error');
      this.emit('error', true, data, clientId);
      return;
    }
    if (data != null && data.global) {
      debug('Received a global error');
      this.emit('error', true, data.data, clientId);
      return;
    }
    if (!this.validateData(data, clientId)) return;
    debug('Received an error from ' + data.name);
    this.synchronizers[data.name].handleError(data.data, clientId);
  }
  handleDisconnect(clientId) {
    debug('Received disconnect');
    this.emit('disconnect', true, clientId);
    for (let key in this.synchronizers) {
      this.synchronizers[key].handleDisconnect(clientId);
    }
  }
  validateData(data, clientId) {
    if (data == null || data.name == null ||
      this.synchronizers[data.name] == null
    ) {
      let err = { global: true, data: 'Data packet is malformed' };
      this.emit('error', true, err.data, clientId);
      this.connector.error(err, clientId);
      return false;
    }
    return true;
  }
}
