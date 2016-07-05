import { toObject, STRING, NUMBER } from 'r6rs';

export default {
  'require': (params, callback, _, io) => {
    let options;
    if (params.type === STRING) {
      options = params.value;
    } else {
      options = toObject(params)[0];
    }
    let library;
    try {
      // r6rs-async-io-* has higher priority, if exists.
      library = require('r6rs-async-io-' + options);
    } catch (e) {
      try {
        library = require(options);
      } catch (e) {
        throw e;
      }
    }
    if (library.default) library = library.default;

    if (library) {
      io.resolver.addLibrary(library);
      setTimeout(() => callback([], true), 0);
    } else {
      setTimeout(() => callback(['Library not found'], true), 0);
    }
  },
  'timer': (params, callback) => {
    let options;
    if (params.type === NUMBER) {
      options = params.value;
    } else {
      options = toObject(params)[0];
    }
    let timerId = setInterval(callback, options);
    return () => clearInterval(timerId);
  }
};
