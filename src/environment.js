import { Synchronizer, HostSynchronizer } from 'locksmith';
import { Machine, PairValue, SymbolValue } from 'r6rs';
import IOManager, { desugar } from 'r6rs-async-io';
import asyncBaseLib from './asyncBaseLib';
import baseLib from './baseLib';
import Resolver, { unwrapKeyword } from './resolver';

const debug = require('debug')('IoTLogic:environment');

// Since base library *never* changes, I'm pretty sure it's possible to
// cache library data on global variables.
// Async library has almost no cost for reloading, so we don't need caching
// for that.
const LIBRARY_CACHE = {};

export default class Environment {
  constructor(name, connector, config, headless, globalAsyncLibs, resolver) {
    this.name = name;
    this.headless = headless;
    this.globalAsyncLibs = globalAsyncLibs || [];
    this.resolver = resolver || new Resolver(this.name);
    this.runOnStart = true;
    this.noReset = true;
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
      synchronizer.on('disconnect', () => {
        // Cancel all I/O
        if (this.headless) return;
        if (this.ioManager != null) this.ioManager.cancelAll();
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
        this.reset(true);
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
  reset(start = false) {
    if (this.headless) return;
    if (this.ioManager != null) this.ioManager.cancelAll();
    this.machine = new Machine(!LIBRARY_CACHE.loaded, LIBRARY_CACHE);
    // Yes - it's hardcoded, but it shouldn't be changed anyway
    this.machine.quota = 100000;
    this.resolver.name = this.name;
    this.ioRun = [];
    this.ioManager = new IOManager(this.machine, this.resolver,
      (listener, data, remove) => {
        // If listener's callback is null, that means it's null on other side
        // too - we just ignore it.
        if (listener.callback == null) {
          if (listener.once || remove === true) {
            this.ioManager.cancel(listener.id);
          }
          return;
        }
        // Dry-run the code; If it doesn't do any mutation, it can be run from
        // the client.
        let dataVal = desugar(data);
        if (dataVal) {
          dataVal = dataVal.map(v => new PairValue(new SymbolValue('quote'),
            new PairValue(v)));
        }
        let pair = new PairValue(listener.callback, dataVal);
        let mutated;
        let ioWorked = false;
        let ioQueue = [];
        let parentListener = {
          id: listener.id,
          data: data,
          localId: listener.localId || 0,
          commits: 0,
          parentListener: listener.parentListener
        };
        try {
          this.machine.clearStack();
          this.machine.parentListener = null;
          mutated = this.machine.evaluate(pair, true, false,
            (expression, procedure, stackData) => {
              // Optimization
              if (procedure.mutable !== 'async-io') return true;
              if (procedure.name === 'io-cancel') return true;
              let keyword = stackData.list.car;
              let [deviceName] = unwrapKeyword(keyword);
              if (deviceName !== this.name) return true;
              let ioId = listener.id + '_' + (parentListener.localId ++);
              parentListener.commits ++;
              ioQueue.push({
                id: ioId,
                list: stackData.list,
                stackData: stackData,
                once: procedure.name !== 'io-listen'
              });
              stackData.ioId = ioId;
              stackData.parentListener = parentListener;
              stackData.stop = true;
              stackData.result = new SymbolValue(ioId);
              ioWorked = true;
              return false;
            });
          if (mutated !== true && ioWorked) {
            // Well, we've just finished running it - finalize the event.
            if (listener.once || remove === true) {
              this.ioManager.cancel(listener.id);
            }
            // Process IO queue
            ioQueue.forEach(io => {
              if (io.once) {
                this.ioManager.once(io.list, io.stackData);
              } else {
                this.ioManager.listen(io.list, io.stackData);
              }
            });
            listener.localId = parentListener.localId;
            this.ioRun.push(listener.id);
            return;
          }
          if (mutated !== true) return;
        } catch (e) {
          // It's pretty clear that it's not mutating anything
          // Still, try to send the error to the synchronizer
          // Inject stacktrace
          let msg = e.message;
          let stackTrace = this.machine.getStackTrace(true);
          if (stackTrace) msg += '\n' + stackTrace;
          this.synchronizer.emit('error', new Error(msg));
        }
        // :P... Data must be a plain JSON object.
        this.synchronizer.push({
          type: 'io',
          id: listener.id,
          data, remove,
          parentListener: listener.parentListener
        });
      }, undefined, (frame, listener) => {
        if (frame.ioId) {
          listener.parentListener = frame.parentListener;
          return frame.ioId;
        }
        if (frame.parentListener) {
          listener.parentListener = frame.parentListener;
          let lastListener = listener.parentListener;
          return lastListener.id + '_' + (lastListener.localId ++);
        }
        if (this.machine.parentListener) {
          listener.parentListener = this.machine.parentListener;
          let lastListener = listener.parentListener;
          return lastListener.id + '_' + (lastListener.localId ++);
        }
        return this.ioManager.listenerId ++;
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

    if (this.handleReset) this.handleReset();

    if (!start || this.runOnStart) this.runPayload();
  }
  setPayload(payload) {
    this.payload = payload;
  }
  runPayload() {
    if (this.payload == null) return;
    if (this.headless) return;
    try {
      return this.machine.evaluate(this.payload);
    } catch (e) {
      // Inject stacktrace
      let msg = e.message;
      let stackTrace = this.machine.getStackTrace(true);
      if (stackTrace) msg += '\n' + stackTrace;
      throw new Error(msg);
    }
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
  runIo(action, parent = false) {
    if (action.parentListener) {
      this.runIo(action.parentListener, true);
    }
    let findIdx = this.ioRun.indexOf(action.id);
    if (findIdx !== -1) {
      this.ioRun.splice(findIdx, 1);
      return;
    }
    if (action.localId != null) {
      action.localId -= action.commits;
    }
    // (Forcefully) handle callback from remote.
    let listener = this.ioManager.listeners[action.id];
    // This can't happen! Still, try to ignore it.
    if (listener == null) return;
    if (listener.once || action.remove === true) {
      this.ioManager.cancel(listener.id);
    }
    if (listener.callback == null) return;
    let dataVal = desugar(action.data);
    if (dataVal) {
      dataVal = dataVal.map(v => new PairValue(new SymbolValue('quote'),
        new PairValue(v)));
    }
    let pair = new PairValue(listener.callback, dataVal);
    try {
      this.machine.clearStack();
      if (parent) this.machine.parentListener = action;
      return this.machine.evaluate(pair, true);
    } catch (e) {
      // Inject stacktrace
      let msg = e.message;
      let stackTrace = this.machine.getStackTrace(true);
      if (stackTrace) msg += '\n' + stackTrace;
      throw new Error(msg);
    }
  }
  run(action) {
    if (action == null) return;
    switch (action.type) {
    case 'eval': {
      if (this.headless) return;
      this.machine.clearStack();
      this.machine.parentListener = null;
      try {
        return this.machine.evaluate(action.data);
      } catch (e) {
        // Inject stacktrace
        let msg = e.message;
        let stackTrace = this.machine.getStackTrace(true);
        if (stackTrace) msg += '\n' + stackTrace;
        throw new Error(msg);
      }
    }
    case 'io': {
      if (this.headless) return;
      return this.runIo(action);
    }
    case 'reset': {
      if (action.data != null) this.setPayload(action.data);
      this.reset();
      break;
    }
    case 'connect':
      // Should connect / disconnect be considered as I/O event too?
      debug('A client connected');
      this.clientList.push(action.data);
      debug(this.clientList);
      if (this.noReset) break;
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
      if (this.noReset) break;
      debug('Resetting machine state');
      this.reset();
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
