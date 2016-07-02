import { Synchronizer, HostSynchronizer } from 'locksmith';
import { Machine } from 'r6rs';

export default class Environment {
  constructor(connector, config) {
    // Initialize Scheme environment
    this.machine = new Machine();
    // TODO Integrate r6rs-async-io
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
      this.machine.clearStack();
      return this.machine.evaluate(action.data);
    }
    case 'io':
      // TODO
      break;
    case 'reset':
      console.log('Resetting machine state');
      this.machine = new Machine();
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
