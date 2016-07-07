import { DefaultResolver } from 'r6rs-async-io';
import { SYMBOL, STRING, PAIR } from 'r6rs';

const NOOP = () => {};

function checkValidity(data) {
  if (data == null ||
    (data.type !== SYMBOL && data.type !== STRING)
  ) {
    throw new Error('Data must be a string or symbol');
  }
  return data;
}

// Resolver that considers device name... This actually creates no-op for
// different device names.
export default class Resolver extends DefaultResolver {
  constructor(name, directives) {
    super(directives);
    this.name = name;
  }
  resolve(keyword) {
    if (keyword == null) throw new Error('Event name cannot be null');
    let deviceName, commandName;
    if (keyword.type === PAIR) {
      // In this case, deviceName is car, and commandName is cadr.
      // other variables will be ignored, however.
      deviceName = checkValidity(keyword.car).value;
      commandName = checkValidity(keyword.cdr.car).value;
    } else if (keyword.type === SYMBOL || keyword.type === STRING) {
      // TODO We have to handle nonexistent directives, since we have to send
      // other nodes 'not exist' error.
      if (keyword.value.indexOf(':') === -1) {
        throw new Error('Device name must be specified like client:doStuff');
      }
      let pos = keyword.value.indexOf(':');
      deviceName = keyword.value.slice(0, pos);
      commandName = keyword.value.slice(pos + 1);
    } else {
      throw new Error('Event name must be a string, symbol, or pair');
    }
    // This requires synchronization between multiple devices - some device can
    // issue an error, but some may not. TODO
    if (deviceName !== this.name) {
      // Create no-op
      return NOOP;
    }
    return this.directives[commandName];
  }
}
