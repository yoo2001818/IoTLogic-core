import { EventEmitter } from 'events';

// This delegates between the synchronizer and connector, allowing multiple
// synchronizers to be attached in single connector.
// Synchronizer will assume that this is an connector, while connector will
// assume that this is an synchronizer.
export default class Router extends EventEmitter {
  constructor(connector, host) {
    super();
    this.connector = connector;
    this.connector.synchronizer = this;
    this.host = host;
    this.synchronizers = {};
  }
  addSynchronizer(name, synchronizer) {
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
        this.connector.push({ name, data }, clientId);
      },
      ack: (data, clientId) => {
        this.connector.ack({ name, data }, clientId);
      },
      connect: (data, clientId) => {
        this.connector.connect({ name, data }, clientId);
      },
      disconnect: (clientId) => {
        // TODO Maybe we should disconnect from only one synchronizer?
        this.connector.disconnect(clientId);
      },
      error: (data, clientId) => {
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
    delete this.synchronizer[name];
  }
  start(data) {
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
    this.synchronizers[data.name].handlePush(data.data, clientId);
  }
  handleAck(data, clientId) {
    if (!this.validateData(data, clientId)) return;
    this.synchronizers[data.name].handleAck(data.data, clientId);
  }
  handleConnect(data, clientId) {
    if (this.host) {
      // TODO we should do authentication and check where it belongs.
      for (let key in this.synchronizers) {
        this.synchronizers[key].handleConnect(data, clientId);
      }
    } else {
      // TODO Create synchronizer if it doesn't exists.
      console.log(data);
      if (data && this.synchronizers[data.name] == null) {
        console.log('Missing synchronizer');
      }
      if (!this.validateData(data, clientId)) return;
      this.synchronizers[data.name].handleConnect(data.data, clientId);
    }
  }
  handleError(data, clientId) {
    if (data != null && data.global) {
      this.emit('error', data.data, clientId);
    }
    this.validateData(data, clientId);
    this.synchronizers[data.name].handleError(data.data, clientId);
  }
  handleDisconnect(clientId) {
    for (let key in this.synchronizers) {
      this.synchronizers[key].handleDisconnect(clientId);
    }
  }
  validateData(data, clientId) {
    if (data == null || data.name == null ||
      this.synchronizers[data.name] == null
    ) {
      let err = { global: true, data: 'Data packet is malformed' };
      this.emit('error', null, err.data, clientId);
      this.connector.error(err, clientId);
      return false;
    }
  }
}
