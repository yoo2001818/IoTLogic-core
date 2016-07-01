import Synchronizer from 'locksmith';
import { Machine } from 'r6rs';

export default class Environment {
  constructor(connector, config) {
    // Initialize Scheme environment
    this.machine = new Machine();
    // TODO Integrate r6rs-async-io
    // Initialize lockstep environment
    let synchronizer = new Synchronizer(this, connector, config);
    synchronizer.host = config != null;
    connector.synchronizer = synchronizer;

    this.synchronizer = synchronizer;
    // Evaluation may want to use callbacks, so this remembers the callback
    // to call.
    this.evalCallbacks = {};
    this.evalCallbackId = 0;
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
    console.log(this.machine);
    // Still, try to send the initial payload.
    return this.payload;
  }
  loadState(state) {
    this.machine = new Machine();
    this.setPayload(state);
    this.runPayload();
  }
  start() {
    this.synchronizer.start();
    this.runPayload();
  }
  run(action) {
    if (action == null) return;
    switch (action.type) {
    case 'eval': {
      let result, errored;
      try {
        // Just run the machine. Nothing else..
        result = this.machine.evaluate(action.data);
      } catch (e) {
        this.machine.clearStack();
        errored = true;
        result = e;
      }
      // TODO Locksmith should support callbacks
      if (action.id >= this.evalCallbackId) {
        this.evalCallbackId = action.id + 1;
      }
      if (this.evalCallbacks[action.id]) {
        if (errored) {
          this.evalCallbacks[action.id].reject(result);
        } else {
          this.evalCallbacks[action.id].resolve(result);
        }
        delete this.evalCallbacks[action.id];
      }
      break;
    }
    case 'io':
      // TODO
      break;
    }
  }
  evaluate(code) {
    let promise = new Promise((resolve, reject) => {
      this.evalCallbacks[this.evalCallbackId] = {
        resolve, reject
      };
    });
    this.synchronizer.push({
      type: 'eval',
      id: this.evalCallbackId ++,
      data: code
    });
    return promise;
  }
}
