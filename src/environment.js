import { Synchronizer, HostSynchronizer } from 'locksmith';
import { Machine } from 'r6rs';
import IOManager from 'r6rs-async-io';
import asyncIORequire from './asyncIORequire';
import Resolver from './resolver';

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
    this.machine = new Machine();
    this.ioManager = new IOManager(this.machine, new Resolver(this.name));
    this.machine.loadLibrary(this.ioManager.getLibrary());
    this.ioManager.resolver.addLibrary(asyncIORequire);
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
    case 'io':
      // TODO
      break;
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
