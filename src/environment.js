import { Synchronizer, HostSynchronizer } from 'locksmith';
import { Machine, PairValue, SymbolValue } from 'r6rs';
import IOManager, { desugar } from 'r6rs-async-io';
import asyncBaseLib from './asyncBaseLib';
import Resolver from './resolver';

// Since base library *never* changes, I'm pretty sure it's possible to
// cache library data on global variables.
// Async library has almost no cost for reloading, so we don't need caching
// for that.
const LIBRARY_CACHE = {};

export default class Environment {
  constructor(name, connector, config) {
    this.name = name;
    // Initialize Scheme environment
    this.reset();
    // Initialize lockstep environment
    let synchronizer;
    if (config == null) {
      synchronizer = new Synchronizer(this, connector, config);
    } else {
      synchronizer = new HostSynchronizer(this, connector, config);
      synchronizer.on('connect', () => {
        // Reset entire machine status, since we can't serialize Scheme state.
        synchronizer.push({
          type: 'reset'
        });
      });
    }
    connector.synchronizer = synchronizer;

    this.synchronizer = synchronizer;
  }
  reset() {
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
      this.machine.loadLibrary(this.ioManager.getLibrary());
    }
    LIBRARY_CACHE.loaded = true;
    this.ioManager.resolver.addLibrary(asyncBaseLib);
  }
  setPayload(payload) {
    this.payload = payload;
  }
  runPayload() {
    if (this.payload == null) return;
    this.machine.evaluate(this.payload);
  }
  getState() {
    // It's hard to serialize entire Scheme interpreter state...
    // It's necessary though, however.
    console.log(this.machine.rootParameters);
    console.log(this.machine.expanderRoot);
    // Still, try to send the initial payload.
    return this.payload;
  }
  loadState(state) {
    this.setPayload(state);
  }
  start() {
    this.synchronizer.start();
    this.runPayload();
  }
  run(action) {
    if (action == null) return;
    switch (action.type) {
    case 'eval': {
      this.machine.clearStack();
      return this.machine.evaluate(action.data);
    }
    case 'io': {
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
    case 'reset':
      console.log('Resetting machine state');
      this.ioManager.cancelAll();
      this.reset();
      this.runPayload();
    }
  }
  evaluate(code) {
    return this.synchronizer.push({
      type: 'eval',
      data: code
    }, true);
  }
}
