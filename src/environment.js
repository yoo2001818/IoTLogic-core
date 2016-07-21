import { Synchronizer, HostSynchronizer } from 'locksmith';
import { Machine, PairValue, SymbolValue } from 'r6rs';
import IOManager, { desugar } from 'r6rs-async-io';
import asyncBaseLib from './asyncBaseLib';
import baseLib from './baseLib';
import Resolver from './resolver';

const debug = require('debug')('IoTLogic:environment');

// Since base library *never* changes, I'm pretty sure it's possible to
// cache library data on global variables.
// Async library has almost no cost for reloading, so we don't need caching
// for that.
const LIBRARY_CACHE = {};

export default class Environment {
  constructor(name, connector, config, headless, globalAsyncLibs) {
    this.name = name;
    this.headless = headless;
    this.globalAsyncLibs = globalAsyncLibs || [];
    // Initialize Scheme environment
    this.reset();
    // We don't need clients variable - since referencing client by ID is
    // not used anyway.
    this.clientList = [];
    // Initialize lockstep environment
    let synchronizer;
    if (config == null) {
      synchronizer = new Synchronizer(this, connector, config);
      synchronizer.on('connect', () => {
        this.name = synchronizer.meta.name;
        if (this.ioManager && this.ioManager.resolver) {
          this.ioManager.resolver.name = synchronizer.meta.name;
        }
      });
    } else {
      synchronizer = new HostSynchronizer(this, connector, config);
      // TODO Add validator
      synchronizer.on('start', () => {
        if (!synchronizer.host) return;
        let selfId = synchronizer.connector.getHostId();
        // Forcefully override meta data
        synchronizer.clients[selfId].meta = {
          name: this.name,
          host: true
        };
        this.clientList = [Object.assign({},
          this.synchronizer.clients[selfId].meta,
          { id: selfId }
        )];
        this.runPayload();
      });
      synchronizer.on('connect', clientId => {
        synchronizer.push({
          type: 'connect',
          data: Object.assign({}, synchronizer.clients[clientId].meta, {
            id: clientId
          })
        });
      });
      synchronizer.on('disconnect', clientId => {
        synchronizer.push({
          type: 'disconnect',
          data: clientId
        });
      });
    }
    connector.synchronizer = synchronizer;

    this.synchronizer = synchronizer;
  }
  reset() {
    if (this.headless) return;
    if (this.ioManager != null) this.ioManager.cancelAll();
    this.machine = new Machine(!LIBRARY_CACHE.loaded, LIBRARY_CACHE);
    this.ioManager = new IOManager(this.machine, new Resolver(this.name),
      (listener, data, remove) => {
        // If listener's callback is null, that means it's null on other side
        // too - we just ignore it.
        if (listener.callback == null) {
          if (listener.once || remove === true) {
            this.ioManager.cancel(listener.id);
          }
          return;
        }
        // :P... Data must be a plain JSON object.
        this.synchronizer.push({
          type: 'io',
          id: listener.id,
          data, remove
        });
      }
    );
    if (!LIBRARY_CACHE.loaded) {
      this.machine.loadLibrary(baseLib);
      this.machine.loadLibrary(this.ioManager.getLibrary());
    }
    LIBRARY_CACHE.loaded = true;
    this.ioManager.resolver.addLibrary(asyncBaseLib);
    this.globalAsyncLibs.forEach(lib => {
      this.ioManager.resolver.addLibrary(lib);
    });

    // Expose the Environment object to base library
    this.machine.asyncIO = this.ioManager;
    this.machine.iotLogicEnv = this;

    this.runPayload();
  }
  setPayload(payload) {
    this.payload = payload;
  }
  runPayload() {
    if (this.payload == null) return;
    if (this.headless) return;
    this.machine.evaluate(this.payload);
  }
  getState() {
    // What if the server is headless? We have to retrieve the data
    // from remote... I suppose?
    if (!this.headless) {
      // It's hard to serialize entire Scheme interpreter state...
      // It's necessary though, however.
      // console.log(this.machine.rootParameters);
      // console.log(this.machine.expanderRoot);
    }
    // Still, try to send the initial payload.
    return {
      payload: this.payload,
      clientList: this.clientList
    };
  }
  loadState(state) {
    this.setPayload(state.payload);
    this.clientList = state.clientList;
  }
  run(action) {
    if (action == null) return;
    switch (action.type) {
    case 'eval': {
      if (this.headless) return;
      this.machine.clearStack();
      return this.machine.evaluate(action.data);
    }
    case 'io': {
      if (this.headless) return;
      // (Forcefully) handle callback from remote.
      let listener = this.ioManager.listeners[action.id];
      // This can't happen! Still, try to ignore it.
      if (listener == null) return;
      if (listener.callback == null) {
        if (listener.once || action.remove === true) {
          this.ioManager.cancel(listener.id);
        }
        return;
      }
      let dataVal = desugar(action.data);
      if (dataVal) {
        dataVal = dataVal.map(v => new PairValue(new SymbolValue('quote'),
          new PairValue(v)));
      }
      let pair = new PairValue(listener.callback, dataVal);
      return this.machine.evaluate(pair, true);
    }
    case 'reset': {
      this.setPayload(action.data);
      this.reset();
      break;
    }
    case 'connect':
      // Should connect / disconnect be considered as I/O event too?
      debug('A client connected');
      this.clientList.push(action.data);
      debug(this.clientList);
      debug('Resetting machine state');
      this.reset();
      break;
    case 'disconnect': {
      debug('A client disconnected');
      // Disconnection doesn't have to reset machine state.
      // Get rid of the client on the array
      let clientIndex = this.clientList.findIndex(o => o.id === action.data);
      if (clientIndex === -1) {
        // What?
        throw new Error('Disconnect event malformed: ' + action.data);
      }
      this.clientList.splice(clientIndex, 1);
      debug(this.clientList);
    }
    }
  }
  evaluate(code) {
    return this.synchronizer.push({
      type: 'eval',
      data: code
    }, true);
  }
}
